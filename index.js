require('dotenv').config()
const WebSocket = require('ws')
const http = require('http')

const { getRequestBody } = require('./src/support.js')

const server = http.createServer(requestListener)
const wss = new WebSocket.Server({ server })

function requestListener (request, response) {
  const { method } = request
  if (stats.requests[method] === undefined) { stats.requests[method] = 0 }
  stats.requests[method]++
  if (method === 'GET') {
    // возвращаем json со статусом
    statusResponse(response)
  } else if (method === 'POST') {
    processPostMessage(request, response)
  };
}

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
  try {
    const requestBody = await getRequestBody(request)
    console.log(requestBody)
    const { params, messages } = JSON.parse(requestBody)

    messages.forEach(msg => {
      switch (msg.type) {
        case 'message':
        case 'notify-changed':
        case 'notify-type-changed':
        case 'notify':
          broadcast(params.filter, msg.channel, msg.data)
          break
      }
    })

    response.writeHead(200, { 'Content-Type': 'application/json' })

    const status = { status: 'OK' }
    response.end(JSON.stringify(status))
  } catch (error) {
    console.error(error)
    response.writeHead(500)
    response.end(error.message)
  }
}

server.listen(process.env.PORT || 0x1c1c) // 7196

wss.on('connection', function connection (ws) {
  waitParams.add(ws)
  ws.filter = undefined

  ws.on('message', function incoming (message) {
    const msg = JSON.parse(message)

    stats.messages++
    if (stats.messagesByType[msg.type] === undefined) { stats.messagesByType[msg.type] = 0 }
    stats.messagesByType[msg.type]++

    switch (msg.type) {
      case 'params':
        if (waitParams.has(ws)) {
          waitParams.delete(ws)
          ws.filter = msg.filter
          ws.channels = new Set()
          //          ws.listenBroadcast = msg.listenBroadcast === undefined ? true : !!msg.listenBroadcast
          ws.listenBroadcast = msg.listenBroadcast ?? true
          subscribe(ws, undefined)
        } else {
          ws.send({ type: 'error', data: 'params already set' })
        }
        break

      case 'message':
      case 'notify-changed':
      case 'notify-type-changed':
      case 'notify':
        if (!waitParams.has(ws)) {
          broadcast(ws.filter, msg.channel, msg.data)
        } else {
          ws.send({ type: 'error', data: 'wait for params' })
        }
        break

      case 'join':
        if (!waitParams.has(ws)) {
          subscribe(ws, msg.channel, msg.data)
        } else {
          ws.send({ type: 'error', data: 'wait for params' })
        }
        break
      case 'leave':
        if (!waitParams.has(ws)) {
          unsubscribe(ws, msg.channel, msg.data)
        } else {
          ws.send({ type: 'error', data: 'wait for params' })
        }
        break

      default:
        break
    }
  })

  ws.on('close', function () {
    waitParams.delete(ws)
    ws.channels.forEach(channel => unsubscribe(ws, channel))
    // ChannelManager.unsubscribeClient(ws)
  })

  ws.send('wait for params')
})

function subscribe (ws, channel) {
  const { filter } = ws
  let channelObj = channels.find(el => el.channel === channel && el.filter === filter)
  if (!channelObj) {
    channelObj = { channel, filter, clients: new Set() }
    channels.push(channelObj)
  }
  channelObj.clients.add(ws)
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

function broadcast (filter, channel, data) {
  const channelObj = channels.find(el => el.channel === channel && el.filter === filter)
  if (!channelObj) { return }
  channelObj.clients.forEach(client => {
    client.send(data)
  })
}
