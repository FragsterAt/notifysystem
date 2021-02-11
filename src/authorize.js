const { getRequestBody } = require('./support')
const https = require('https')

const secret = process.env['RECAPTCHA-SECRET']
const key = process.env.KEY

function verifyToken (token) {
  return new Promise((resolve, reject) => {
    const verifyUrl = new URL('/recaptcha/api/siteverify', 'https://www.google.com')
    verifyUrl.searchParams.set('secret', secret)
    verifyUrl.searchParams.set('response', token)

    https.get(verifyUrl.toString(), async res => {
      const body = await getRequestBody(res)
      resolve(!!JSON.parse(body).success)
    }).on('error', e => {
      reject(e)
    })
  })
}

module.exports.authorize = async function (request) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`)
  const params = requestUrl.searchParams
  let success = !secret && !key
  if (secret && params.has('token')) {
    success = await verifyToken(params.get('token'))
  } else if (key && params.has('key')) {
    success = key === params.get('key')
  }
  return success
}
