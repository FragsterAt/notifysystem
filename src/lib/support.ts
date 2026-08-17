import { IncomingMessage } from "http"
import { NotificationSocket } from "./notificationSocket.js"
import stringify from "fast-json-stable-stringify"

export function getRequestBody (request: IncomingMessage): Promise<string> {
  return new Promise(function (resolve, reject) {
    let body = ''
    request.on('data', function (data) {
      body += data
    })
    request.on('end', function () {
      resolve(body)
    })
  })
}

export async function execJsonRpc (notificationSocket: NotificationSocket, rpcObjects: Record<string, NotificationRPCObject>, msg: RpcMessage) {
  try {
    const namespace = msg.method.split('.')[0]    
    const rpcObject = rpcObjects[namespace]
    if (!rpcObject) {
      notificationSocket.send({ type: 'rpc-result', error: { code: 404, message: 'Namespace Not Found' }, id: msg.id })
      return
    }
    if (typeof rpcObject.methods[msg.method] !== 'function') {
      notificationSocket.send({ type: 'rpc-result', error: { code: 405, message: 'Method Not Allowed' }, id: msg.id })
      return
    }
    const result = await rpcObject.methods[msg.method](msg.params, notificationSocket)
    if (msg.id !== undefined && msg.id !== null) {
      notificationSocket.send({ type: 'rpc-result', result, id: msg.id })
    }
  } catch (error) {
    notificationSocket.send({ type: 'rpc-result', error, id: msg.id })
  }
}

export function getChannelKey(filter: string, channel: string) {
  return `${filter}:${channel}`
}
export function getClientKey(filter: string, client: unknown) {
  return stringify({filter, client})
}

export function defineRPCMethods<T extends Record<string, NotificationRPCMethod>>(methods: T): T {
  return methods
}