require('dotenv').config()

const { authorize } = require('./src/authorize')
const { createServer } = require('./src/server')

const stats = {
  messages: 0,
  messagesByType: {},
  requests: {}
}
function getStats () {
  const serverStats = server.getStats()
  return { ...stats, ...serverStats }
}
function onMessage (msg) {
  stats.messages++
  if (stats.messagesByType[msg.type] === undefined) { stats.messagesByType[msg.type] = 0 }
  stats.messagesByType[msg.type]++
}
function onRequest (request) {
  const { method } = request
  if (stats.requests[method] === undefined) { stats.requests[method] = 0 }
  stats.requests[method]++
}

function statusResponse (response) {
  const status = { status: 'OK', stats: getStats() }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(status))
}

const server = createServer({ authorize, statusResponse, onRequest, onMessage })

server.start(process.env.PORT)
