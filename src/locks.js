import { isEqual } from 'lodash-es'
import { broadcast } from './server.js'

const lockChannels = []
/**
 *
 * @param {WebSocket} ws
 * @param {channel: String, type: 's'|'x', resource: *} params
 * @param {Number} rpcId
 */
async function lock (ws, { channel, type, resource }) {
  let lockChannelIndex = lockChannels.findIndex(cl => cl.filter === ws.filter && cl.channel === channel)
  if (lockChannelIndex === -1) {
    lockChannelIndex = lockChannels.length
    lockChannels.push({ filter: ws.filter, channel, resources: [] })
  }

  const lockChannel = lockChannels[lockChannelIndex]
  const resourceLocks = lockChannel.resources.filter(r => isEqual(r.resource, resource))
  if (type === 'x' && resourceLocks.some(r => r.ws !== ws)) { // хотим установить эксклюзив, но есть другие блокировки
    throw new Error()
  } else if (type === 's' && resourceLocks.some(r => r.type === 'x' && r.ws !== ws)) { // хотим установить разделяемую, но есть эксклюзивная
    throw new Error()
  } else {
    const lock = resourceLocks.find(r => r.ws === ws)
    if (lock) {
      lock.type = type
    } else {
      lockChannel.resources.push({ ws, type, resource })
    }
  }
  broadcast(ws.filter, { type: 'lock', channel, data: { type, resource, client: ws.client, sessionId: ws.sessionId } })
}

async function unlock (ws, { channel, resource }, rpcId) {
  const lockChannelIndex = lockChannels.findIndex(cl => cl.filter === ws.filter && cl.channel === channel)
  if (lockChannelIndex === -1) return
  const lockChannel = lockChannels
  const index = lockChannel.resources.findIndex(r => r.ws === ws && isEqual(r.resource === resource))

  if (index !== 0) {
    lockChannel.resources.splice(index, 1)
    ws.send(rpcId)
    broadcast(ws.filter, { type: 'unlock', channel, data: { resource, client: ws.client, sessionId: ws.sessionId } })
    if (lockChannel.resources.length === 0) {
      lockChannels.splice(lockChannelIndex, 1)
    }
  }
}

function getLocks (ws, channel, resource) {
  const lockChannel = lockChannels.find(cl => cl.filter === ws.filter && cl.channel === channel)
  if (lockChannel === undefined) {
    ws.send(JSON.stringify({ type: 'locks', data: resource, locks: [] }))
    return
  }

  const resourceLocks = lockChannel.resources.filter(r => isEqual(r.resource, resource))
  return resourceLocks()
}

function onClose (ws) {
  for (let i = 0; i < lockChannels.length; i++) {
    const channel = lockChannels[i]
    if (channel.filter !== ws.filter) continue
    const { resources } = channel
    for (let ri = 0; ri < resources.length; ri++) {
      if (resources[ri].ws === ws) {
        resources.splice(ri, 1)
        break
      }
    }
    if (resources.length === 0) {
      lockChannels.splice(i, 1)
      i--
    }
  }
}

const rpcObject = {
  methods: {
    lock, unlock, getLocks
  },
  onClose
}

export default rpcObject
