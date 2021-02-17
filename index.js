require('dotenv').config()
const WebSocket = require('ws')
const http = require('http')

const { authorize } = require('./src/authorize')
const { getRequestBody } = require('./src/support')

const server = http.createServer(requestListener)
const wss = new WebSocket.Server({ noServer: true })

async function requestListener (request, response) {
  const authorized = await authorize(request)
  if (!authorized) {
    response.writeHead(401)
    response.end('401 Unauthorized')
    return
  }

  const { method } = request
  if (stats.requests[method] === undefined) { stats.requests[method] = 0 }
  stats.requests[method]++
  if (method === 'GET') {
    statusResponse(response)
  } else if (method === 'POST') {
    processPostMessage(request, response)
  };
}

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

const waitParams = new Set()
const channels = []

const stats = {
  messages: 0,
  messagesByType: {},
  requests: {}
}
function getStats () {
  return { ...stats, clients: wss.clients.size, channels: channels.length }
}

function statusResponse (response) {
  const status = { status: 'OK', stats: getStats() }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(status))
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

server.listen(process.env.PORT || 0x1c1c) // 7196

wss.on('connection', function connection (ws) {
  // console.log(new Date(), 'ws', 'connection')
  waitParams.add(ws)
  ws.filter = undefined

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
      stats.messages++
      if (stats.messagesByType[msg.type] === undefined) { stats.messagesByType[msg.type] = 0 }
      stats.messagesByType[msg.type]++
    } catch (error) {
      console.error(error, message)
      ws.send(JSON.stringify({ type: 'error', data: 'Wrong message format' }))
      return
    }

    try {
      switch (msg.type) {
        case 'params':
          if (waitParams.has(ws)) {
            waitParams.delete(ws)
            ws.filter = msg.data?.filter ?? msg.filter
            ws.channels = new Set()
            //          ws.listenBroadcast = msg.listenBroadcast === undefined ? true : !!msg.listenBroadcast
            ws.listenBroadcast = msg.data.listenBroadcast ?? true
            if (ws.listenBroadcast) { subscribe(ws, null) }
            ws.send(JSON.stringify({ type: 'ready' }))
          // wss.clients.forEach(ws => console.log('filter', ws.filter))
          } else {
            ws.send(JSON.stringify({ type: 'error', data: 'params already set' }))
          }
          break

        case 'message':
        case 'notify-changed':
        case 'notify-type-changed':
        case 'notify':
        case 'navigation-link':
        case 'user-alert':
          if (!waitParams.has(ws)) {
            broadcast(ws.filter, msg)
          } else {
            ws.send(JSON.stringify({ type: 'error', data: 'wait for params' }))
          }
          break

        case 'join':
          if (!waitParams.has(ws)) {
            subscribe(ws, msg.channel, msg.data)
          } else {
            ws.send(JSON.stringify({ type: 'error', data: 'wait for params' }))
          }
          break
        case 'leave':
          if (!waitParams.has(ws)) {
            unsubscribe(ws, msg.channel, msg.data)
          } else {
            ws.send(JSON.stringify({ type: 'error', data: 'wait for params' }))
          }
          break

        default:
          break
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
    // ChannelManager.unsubscribeClient(ws)
  })

  ws.send(JSON.stringify({ type: 'waitParams', data: 'wait for params' }))
})

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

function broadcast (filter, { type, channel = null, data }) {
  const channelObj = channels.find(el => el.channel === channel && el.filter === filter)
  // console.log(new Date(), 'broadcast', channelObj?.clients?.size, { filter, type, channel, data })
  // console.log(channel, filter, channelObj)
  if (!channelObj) { return }
  channelObj.clients.forEach(client => {
    client.send(JSON.stringify({ type, channel, data }))
  })
}
