import * as dotenv from 'dotenv'

import { ServerResponse } from 'http'
import { createServer, RpcLockManager } from '@/index.js'
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
function onRequest (request: IncomingMessage) {
  const { method = 'unknown' } = request
  if (stats.requests[method] === undefined) { stats.requests[method] = 0 }
  stats.requests[method]++
}

function statusResponse (response: ServerResponse) {
  const status = { status: 'OK', stats: getStats() }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(status))
}

declare namespace NodeJS {
  interface ProcessEnv {
    POST_KEY: string
    OTP_CHECK_URL: string
    DISCONNECT_URL: string
    TOUCH_URL: string
  }
}

async function authorize (request: IncomingMessage) {
  try {
    if (request.method === 'POST') {
      const token = request.headers.authorization?.replace('Bearer ', '')
      return token === process.env.POST_KEY
    }
    const url = new URL(request.url ?? '', `http://${request.headers.host}`)
    const session = url?.searchParams.get('session')
    const response = await fetch(`${process.env.OTP_CHECK_URL}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ session })
    })
    console.log('authorize', session, response)
    if (!response.ok) {
      console.log('authorize failed', session, response)
      return false
    }
    const params = response.status === 204 ? undefined : await response.json()
    console.log('authorize', session, params)
    return {
      authorized: response.ok,
      params
    }
  } catch (error) {
    console.error(error)
    return false
  }
}

async function onClose (notificationSocket: NotificationSocket) {
  try {
    console.log('disconnect', notificationSocket.session)
    await fetch(`${process.env.DISCONNECT_URL}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: notificationSocket.session
      })
    })
  } catch (error) {
    console.error(error)
  }
}

function onMessage (notificationSocket: NotificationSocket, msg: NotificationMessage) {
  stats.messages++
  if (stats.messagesByType[msg.type] === undefined) { stats.messagesByType[msg.type] = 0 }
  stats.messagesByType[msg.type]++
  console.log('session', notificationSocket.session, msg)
}

const server = createServer({ authorize, statusResponse, onRequest, onMessage, onClose })

server.rpcObjects['locks'] = new RpcLockManager('locks')
server.rpcObjects['test'] = {
  onClose: (notificationSocket: NotificationSocket) => console.log('test onClose', notificationSocket.session),
  methods: {
    timeout (params: { timeout: number }) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve('timeout')
        }, params.timeout)
      })
    }
  }
}
server.start(process.env.PORT)

setInterval(async () => {
  await fetch(`${process.env.TOUCH_URL}`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessions: [...server.sessions.keys()]
    })
  })
}, 1000 * 60 * 5)
