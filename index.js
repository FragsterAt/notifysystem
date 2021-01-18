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
const channels = new Map()

const stats = {
  messages: 0,
  messagesByType: {},
  requests: {}
}
function getStats () {
  return { ...stats, clients: wss.clients.size }
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
          broadcast(params.filter, msg.data, msg.channel)
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

console.log(process.env.PORT)
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
          //          ws.listenBroadcast = msg.listenBroadcast === undefined ? true : !!msg.listenBroadcast
          ws.listenBroadcast = msg.listenBroadcast ?? true
        } else {
          ws.send({ type: 'error', data: 'params already set' })
        }
        break

      case 'message':
        if (!waitParams.has(ws)) {
          broadcast(msg.filter, msg.data)
        } else {
          ws.send({ type: 'error', data: 'wait for params' })
        }
        break

      case 'notify-changed':
      case 'notify-type-changed':
      case 'notify':
        broadcast(msg.filter, msg.data)
        break

      case 'join':
        subscribe(msg.channel, ws)
        break
      case 'leave':
        unsubscribe(msg.channel, ws)
        break

      default:
        break
    }
  })

  ws.on('close', function () {
    waitParams.delete(ws)
    // ChannelManager.unsubscribeClient(ws)
  })

  ws.send('wait for params')
})

function subscribe (channel, ws) {
  const { filter } = ws
  if (!channels.has({ channel, filter })) { channels.set({ channel, filter }, new Set()) }
  channels.get({ channel, filter }).add(ws)
}

function unsubscribe (channel, ws) {
  const { filter } = ws
  if (!channels.has({ channel, filter })) { return }
  const members = channels.get({ channel, filter })
  members.delete(ws)
  if (members.size === 0) { channels.delete({ channel, filter }) }
}

function broadcast (filter, data, channel) {
  wss.clients.forEach(function each (client) {
    if (client.filter === filter) {
      client.send(data)
    }
  })
}
