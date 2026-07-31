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

export async function execJsonRpc (notificationSocket: NotificationSocket, rpcObjects: NotificationRPCObject[], msg: RpcMessage) {
  try {
    for (const rpcObject of rpcObjects) {
      if (!rpcObject.methods[msg.method]) continue
      const result = await rpcObject.methods[msg.method](notificationSocket, msg.params)
      notificationSocket.send({ jsonrpc: '2.0', result, id: msg.id })
      return
    }
    notificationSocket.send(JSON.stringify({ jsonrpc: '2.0', error: { code: 405, message: 'Method Not Allowed' }, id: msg.id }))
  } catch (error) {
    notificationSocket.send(JSON.stringify({ jsonrpc: '2.0', error, id: msg.id }))
  }
}
