import { WebSocketServer } from 'ws'
import { createServer as createHttpServer } from 'http'

import { execJsonRpc, getRequestBody } from './support.js'
import { uniqueId } from 'lodash-es'

function requestListener ({ authorize, statusResponse, onRequest, onQuit }) {
  return async function (request, response) {
    const authorized = await authorize(request)
    if (!authorized) {
      response.writeHead(401)
      response.end('401 Unauthorized')
      return
    }

    const { method } = request
    try {
      onRequest(request)
    } catch (error) {
      console.error(error)
      response.writeHead(500, { 'Content-Type': 'text/plain' })
      response.end(error.message)
    }

    if (method === 'GET') {
      statusResponse(response)
    } else if (method === 'POST') {
      processPostMessage(request, response)
    };
  }
}

const waitParams = new Set()
const channels = []
let pending = []

function subscribe (ws, channel) {
  const { filter } = ws
  let channelObj = channels.find(el => el.channel === channel && el.filter === filter)
  if (!channelObj) {
    channelObj = { channel, filter, clients: new Set() }
    channels.push(channelObj)
  }
  channelObj.clients.add(ws)
  // console.log(new Date(), 'join', channel, filter, channelObj.clients.size)
  ws.channels.add(channel)

  const pendingMessages = pending.filter(el => el.channel === channel)
  if (pendingMessages.length) {
    pendingMessages.forEach(el => {
      channelObj.clients.forEach(client => {
        const { type, channel, data } = el
        client.send(JSON.stringify({ type, channel, data }))
      })
    })
    pending = pending.filter(el => el.channel !== channel)
  }
}

function unsubscribe (ws, channel) {
  const channelIndex = channels.findIndex(el => el.channel === channel && el.filter === ws.filter)
  if (channelIndex === -1) {
    return
  }
  const channelObj = channels[channelIndex]
  channelObj.clients.delete(ws)
  ws.channels.delete(channel)
  if (channelObj.clients.size === 0) { channels.splice(channelIndex, 1) }
}

export function broadcast (filter, { type, channel = null, data, timeout = null, self = true }, ws) {
  const channelObj = channels.find(el => el.channel === channel && el.filter === filter)
  console.log('broadcast', filter, type, channel, data, channelObj)
  // console.log(new Date(), 'broadcast', channelObj?.clients?.size, { filter, type, channel, data })
  // console.log(channel, filter, channelObj)
  if (!channelObj) {
    if (timeout) pending.push({ type, channel, data, till: Date.now() + timeout * 1000 })
    return
  }
  channelObj.clients.forEach(client => {
    if (self || client !== ws) {
      client.send(JSON.stringify({ type, channel, data, client: ws.client, session: ws.session }))
    }
  })
}

function clearPendingMessages () {
  const now = Date.now()
  pending = pending.filter(i => i.till > now)
}

async function processPostMessage (request, response) {
  let requestBody
  try {
    requestBody = await getRequestBody(request)
    // console.log(new Date(), 'post', requestBody)
    const { params, messages } = JSON.parse(requestBody)

    // console.log(new Date(), 'post params', params)
    messages.forEach(msg => {
      // console.log(new Date(), 'post', msg)

      switch (msg.type) {
        case 'message':
        case 'notify-changed':
        case 'notify-type-changed':
        case 'notify':
        case 'navigation-link':
        case 'user-alert':
          broadcast(params.filter, msg)
          break
      }
    })

    response.writeHead(200, { 'Content-Type': 'application/json' })

    const status = { status: 'OK' }
    response.end(JSON.stringify(status))
  } catch (error) {
    console.error(error, requestBody)
    response.writeHead(500)
    response.end(error.message)
  }
}

export function createServer ({ authorize, statusResponse, onConnection, onRequest, onMessage, onClose, rpcObjects = [] }) {
  const server = createHttpServer(requestListener({ authorize, statusResponse, onRequest }))
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', async (request, socket, head) => {
    const authorized = await authorize(request)
    if (authorized) {
      wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request, request)
      })
    } else {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
    }
  })

  wss.on('connection', function connection (ws) {
    // console.log(new Date(), 'ws', 'connection')
    waitParams.add(ws)
    ws.filter = undefined

    onConnection?.(ws)

    ws.on('message', function incoming (message) {
      let msg
      try {
        msg = JSON.parse(message)
      } catch (error) {
        console.error(error, message)
        ws.send(JSON.stringify({ type: 'error', data: 'Cant parse message' }))
        return
      }
      // console.log(new Date(), 'ws', msg.type, msg)

      try {
        onMessage?.(msg)
      } catch (error) {
        console.error(error, message)
        ws.send(JSON.stringify({ type: 'error', data: 'onMessage handler error', error }))
        return
      }

      try {
        if (msg.type === 'params') {
          if (!waitParams.has(ws)) {
            ws.send(JSON.stringify({ type: 'error', data: 'params already set' }))
            return
          }
        } else {
          if (waitParams.has(ws)) {
            ws.send(JSON.stringify({ type: 'error', data: 'wait for params' }))
            return
          }
        }

        if (msg.jsonrpc) {
          execJsonRpc(ws, rpcObjects, msg)
        } else {
          switch (msg.type) {
            case 'params':
              waitParams.delete(ws)
              ws.filter = msg.data.filter
              ws.session = msg.data.session ?? uniqueId()
              ws.client = msg.data.client
              ws.broadcastChannel = (!!msg.data.broadcastFilter) && `broadcast_${msg.data.broadcastFilter}`
              ws.channels = new Set()
              // ws.listenBroadcast = msg.listenBroadcast === undefined ? true : !!msg.listenBroadcast
              ws.listenBroadcast = !!msg.data.broadcastFilter
              if (ws.listenBroadcast) { subscribe(ws, ws.broadcastChannel) }
              ws.send(JSON.stringify({ type: 'ready', session: ws.session }))
              // wss.clients.forEach(ws => console.log('filter', ws.filter))
              break

            case 'message':
              broadcast(ws.filter, msg, ws)
              break
            case 'broadcast-message':
            case 'notify-changed':
            case 'notify-type-changed':
            case 'notify':
            case 'navigation-link':
            case 'user-alert':
              broadcast(ws.filter, { ...msg, channel: ws.broadcastChannel }, ws)
              break

            case 'join':
              subscribe(ws, msg.channel)
              break
            case 'leave':
              unsubscribe(ws, msg.channel)
              break

            default:
              break
          }
        }
      } catch (error) {
        console.error(error, message)
        ws.send(JSON.stringify({ type: 'error', data: 'Wrong message format' }))
      }
    })

    ws.on('close', function () {
      // console.log(new Date(), 'ws', 'close')
      waitParams.delete(ws)
      ws?.channels?.forEach(channel => unsubscribe(ws, channel))
      rpcObjects.forEach(({ onClose }) => onClose?.(ws))
      // ChannelManager.unsubscribeClient(ws)
      onClose?.(ws)
    })

    ws.send(JSON.stringify({ type: 'waitParams', data: 'wait for params' }))
  })

  let pendingFilterInterval

  /**
   *
   * @param {Number} port порт, по умолчанию 7196 (0x1c1c)
   */
  function start (port = 0x1c1c) {
    server.listen(port)
    pendingFilterInterval = setInterval(clearPendingMessages, 1000)
  }

  function stop () {
    server.closeAllConnections()
    clearInterval(pendingFilterInterval)
  }

  function getStats () {
    return {
      clients: wss.clients.size,
      channels: channels.length,
      pending: pending.length
    }
  }

  return { start, stop, getStats }
}
