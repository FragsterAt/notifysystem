import { WebSocketServer } from 'ws'
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http'

import { execJsonRpc, getRequestBody } from './support.js'
import { uniqueId } from 'lodash-es'
import { NotificationSocket } from './notificationSocket.js'

function requestListener ({ authorize, statusResponse, onRequest }: RequestListenerOptions) {
  return async function (request: IncomingMessage, response: ServerResponse) {
    const authorized = await authorize(request)
    console.log('request', authorized)
    if (!authorized) {
      response.writeHead(401)
      response.end('401 Unauthorized')
      return
    }

    const { method } = request
    try {
      onRequest?.(request)
    } catch (error) {
      console.error(error)
      response.writeHead(500, { 'Content-Type': 'text/plain' })
      response.end(error instanceof Error ? error.message : String(error))
    }

    if (method === 'GET') {
      statusResponse(response)
    } else if (method === 'POST') {
      processPostMessage(request, response)
    };
  }
}

const waitParams = new Set<NotificationSocket>()
const channels: NotificationChannel[] = []
let pending: NotificationPendingMessage[] = []

function subscribe (notificationSocket: NotificationSocket, channel: string) {
  const { filter } = notificationSocket
  let channelObj = channels.find(el => el.channel === channel && el.filter === filter)
  if (!channelObj) {
    channelObj = { channel, filter, clients: new Set() }
    channels.push(channelObj)
  }
  channelObj.clients.add(notificationSocket)
  // console.log(new Date(), 'join', channel, filter, channelObj.clients.size)
  notificationSocket.channels.add(channel)

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

function unsubscribe (notificationSocket: NotificationSocket, channel: string) {
  const channelIndex = channels.findIndex(el => el.channel === channel && el.filter === notificationSocket.filter)
  if (channelIndex === -1) {
    return
  }
  const channelObj = channels[channelIndex]
  channelObj.clients.delete(notificationSocket)
  notificationSocket.channels.delete(channel)
  if (channelObj.clients.size === 0) { channels.splice(channelIndex, 1) }
}

export function broadcast (filter: string, { type, channel = null, data, timeout = null, self = true }: DataMessage, sourceSocket: NotificationSocket | undefined = undefined) {
  const channelObj = channels.find(el => el.channel === (channel ?? `broadcast_${filter}`) && el.filter === filter)
  if (!channelObj) {
    if (timeout) pending.push({ type, channel, data, till: Date.now() + timeout * 1000, self })
    return
  }
  channelObj.clients.forEach(client => {
    if (self || client !== sourceSocket) {
      client.send(JSON.stringify({ type, channel, data, client: sourceSocket?.client, session: sourceSocket?.session }))
    }
  })
}

function clearPendingMessages () {
  const now = Date.now()
  pending = pending.filter(i => i.till > now)
}

async function processPostMessage (request: IncomingMessage, response: ServerResponse) {
  let requestBody
  try {
    requestBody = await getRequestBody(request)
    // console.log(new Date(), 'post', requestBody)
    const { params, messages } = JSON.parse(requestBody) as { params: { filter: string }, messages: NotificationMessage[] }

    // console.log(new Date(), 'post params', params)
    messages.forEach(msg => {
      // console.log(new Date(), 'post', msg)

      switch (msg.type) {
        case 'message':
        case 'broadcast-message':
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
    response.end(error instanceof Error ? error.message : String(error))
  }
}

export function createServer ({ authorize, statusResponse, onConnection, onRequest, onMessage, onClose, rpcObjects }: {
  authorize: (request: IncomingMessage) => Promise<boolean>,
  statusResponse: (response: ServerResponse) => void,
  onConnection?: ((notificationSocket: NotificationSocket) => void),
  onRequest?: ((request: IncomingMessage) => void),
  onMessage?: ((msg: NotificationMessage) => void),
  onClose?: ((notificationSocket: NotificationSocket) => void),
  rpcObjects?: Record<string, NotificationRPCObject>
}) {
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
    const notificationSocket = new NotificationSocket(ws)
    waitParams.add(notificationSocket)

    onConnection?.(notificationSocket)

    ws.on('message', function incoming (message) {
      let msg: NotificationMessage
      try {
        const text = message.toString()
        msg = JSON.parse(text) as NotificationMessage
      } catch (error) {
        console.error(error, message)
        notificationSocket.sendError('Cant parse message')
        return
      }
      // console.log(new Date(), 'ws', msg.type, msg)

      try {
        onMessage?.(msg)
      } catch (error) {
        console.error(error, message)
        notificationSocket.sendError('onMessage handler error')
        return
      }

      try {
        if (msg.type === 'params') {
          if (!waitParams.has(notificationSocket)) {
            notificationSocket.sendError('params already set')
            return
          }
        } else {
          if (waitParams.has(notificationSocket)) {
            notificationSocket.sendError('wait for params')
            return
          }
        }

        switch (msg.type) {
          case 'params':
            waitParams.delete(notificationSocket)
            notificationSocket.filter = msg.data.filter
            notificationSocket.session = msg.data.session ?? uniqueId()
            notificationSocket.client = msg.data.client
            notificationSocket.broadcastChannel = `broadcast_${msg.data.broadcastFilter ?? msg.data.filter}`
            notificationSocket.listenBroadcast = msg.data.listenBroadcast ?? true
            if (notificationSocket.listenBroadcast) { subscribe(notificationSocket, notificationSocket.broadcastChannel) }
            notificationSocket.send({ type: 'ready', session: notificationSocket.session })
            break

          case 'message':
            broadcast(notificationSocket.filter, msg, notificationSocket)
            break
          case 'broadcast-message':
          case 'notify-changed':
          case 'notify-type-changed':
          case 'notify':
          case 'navigation-link':
          case 'user-alert':
            broadcast(notificationSocket.filter, { ...msg, channel: notificationSocket.broadcastChannel }, notificationSocket)
            break

          case 'join':
            subscribe(notificationSocket, msg.channel)
            break
          case 'leave':
            unsubscribe(notificationSocket, msg.channel)
            break

          case 'rpc':
            execJsonRpc(notificationSocket, rpcObjects ?? {}, msg)
            break

          default:
            break
        }
      } catch (error) {
        console.error(error, message)
        notificationSocket.sendError('Wrong message format')
      }
    })

    ws.on('close', function () {
      waitParams.delete(notificationSocket)
      notificationSocket?.channels?.forEach(channel => unsubscribe(notificationSocket, channel))
      Object.values(rpcObjects || {}).forEach(({ onClose }) => {
        try {
          onClose?.(notificationSocket)
        } catch (error) {
          console.error(error)
        }
      })
      onClose?.(notificationSocket)
    })

    notificationSocket.send({ type: 'waitParams', data: 'wait for params' })
  })

  let pendingFilterInterval: NodeJS.Timeout

  /**
   *
   * @param {Number} port порт, по умолчанию 7196 (0x1c1c)
   */
  function start (port: number = 0x1c1c) {
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
