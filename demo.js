import { authorize } from './src/authorize.js'
import { createServer } from './src/server.js'
import locksRPC from './src/locks.js'

import * as dotenv from 'dotenv'
dotenv.config()

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

const server = createServer({ authorize, statusResponse, onRequest, onMessage, rpcObjects: [locksRPC] })

server.start(process.env.PORT)
