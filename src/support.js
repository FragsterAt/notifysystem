export function getRequestBody (request) {
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

export async function execJsonRpc (ws, rpcObjects, msg) {
  try {
    for (const rpcObject of rpcObjects) {
      if (!rpcObject.methods[msg.method]) continue
      const result = await rpcObject.methods[msg.method](ws, msg.params)
      console.log('execJsonRpc', msg, result)
      ws.send(JSON.stringify({ jsonrpc: '2.0', result: rpcObject.methods[msg.method](ws, msg.params), id: msg.id }))
      return
    }
    ws.send(JSON.stringify({ jsonrpc: '2.0', error: { code: 405, message: 'Method Not Allowed' }, id: msg.id }))
  } catch (error) {
    ws.send(JSON.stringify({ jsonrpc: '2.0', error, id: msg.id }))
  }
}

export function rpcObjectNS (ns, rpcObject) {
  return {
    ...rpcObject,
    methods: Object.fromEntries(
      Object.entries(rpcObject.methods).map(
        ([name, method]) => [ns + name, method]
      )
    )
  }
}
