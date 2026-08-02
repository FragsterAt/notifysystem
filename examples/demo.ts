import * as dotenv from 'dotenv'

import { authorize } from '@/lib/authorize.js'
import { ServerResponse } from 'http'
import { createServer, RpcLockManager } from '@/index'
dotenv.config()

const stats = {
  messages: 0,
  messagesByType: {} as Record<string, number>,
  requests: {} as Record<string, number>
}
function getStats () {
  const serverStats = server.getStats()
  return { ...stats, ...serverStats }
}
function onMessage (msg : NotificationMessage) {
  stats.messages++
  if (stats.messagesByType[msg.type] === undefined) { stats.messagesByType[msg.type] = 0 }
  stats.messagesByType[msg.type]++
}
function onRequest (request : IncomingMessage) {
  const { method = 'unknown' } = request
  if (stats.requests[method] === undefined) { stats.requests[method] = 0 }
  stats.requests[method]++
}

function statusResponse (response: ServerResponse) {
  const status = { status: 'OK', stats: getStats() }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(status))
}

const lockManager = new RpcLockManager()
const rpcObjects = { [lockManager.namespace]: lockManager }
const server = createServer({ authorize, statusResponse, onRequest, onMessage, rpcObjects })

server.start(process.env.PORT)
