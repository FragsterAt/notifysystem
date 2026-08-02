import { IncomingMessage } from "http"
import { NotificationSocket } from "./notificationSocket.js"

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
      notificationSocket.send({ jsonrpc: '2.0', error: { code: 404, message: 'Namespace Not Found' }, id: msg.id })
      return
    }
    if (!rpcObject.methods[msg.method]) {
      notificationSocket.send({ jsonrpc: '2.0', error: { code: 405, message: 'Method Not Allowed' }, id: msg.id })
      return
    }
    const result = await rpcObject.methods[msg.method](notificationSocket, msg.params)
    if (msg.id !== undefined && msg.id !== null) {
      notificationSocket.send({ jsonrpc: '2.0', result, id: msg.id })
    }
  } catch (error) {
    notificationSocket.send({ jsonrpc: '2.0', error, id: msg.id })
  }
}
