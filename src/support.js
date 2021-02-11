module.exports.getRequestBody = function (request) {
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
