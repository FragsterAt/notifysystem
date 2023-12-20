import { isEqual } from 'lodash-es'

const lockChannels = []

function broadcast (filter, { type, channel, data }, ws) {
  const channelObj = lockChannels.find(el => el.channel === channel && el.filter === filter)
  channelObj.clients.forEach(client => {
    if (client !== ws) {
      client.send(JSON.stringify({ type, channel, data }))
    }
  })
}

/**
 *
 * @param {WebSocket} ws
 * @param {channel: String, type: 's'|'x', resource: *} params
 * @param {Number} rpcId
 */
function lock (ws, { channel, resource, type }) {
  let channelIndex = lockChannels.findIndex(lc => lc.filter === ws.filter && lc.channel === channel)
  if (channelIndex === -1) {
    channelIndex = lockChannels.length
    lockChannels.push({ filter: ws.filter, channel, resources: [], clients: new Set() })
  }

  const channelObj = lockChannels[channelIndex]
  const resourceLocks = channelObj.resources.filter(r => {
    return isEqual(r.resource, resource)
  })
  if (type === 'x' && resourceLocks.some(r => r.ws !== ws)) { // хотим установить эксклюзив, но есть другие блокировки
    throw new Error()
  } else if (type === 's' && resourceLocks.some(r => r.type === 'x' && r.ws !== ws)) { // хотим установить разделяемую, но есть эксклюзивная
    throw new Error()
  } else {
    const lock = resourceLocks.find(r => {
      // console.log(r.ws.session, ws.session, r.ws === ws)
      return r.ws === ws
    })
    // console.log(lock)
    if (lock) {
      lock.type = type
    } else {
      channelObj.resources.push({ ws, type, resource })
    }
  }
  broadcast(ws.filter, { type: 'locks', channel, data: { action: 'lock', type, resource, client: ws.client, session: ws.session } }, ws)
  return { type, resource, client: ws.client, session: ws.session }
}

function unlock (ws, { channel, resource }) {
  const channelIndex = lockChannels.findIndex(lc => lc.filter === ws.filter && lc.channel === channel)
  if (channelIndex === -1) return
  const channelObj = lockChannels[channelIndex]
  const index = channelObj.resources.findIndex(r => r.ws === ws && isEqual(r.resource === resource))

  if (index !== 0) {
    channelObj.resources.splice(index, 1)
    broadcast(ws.filter, { type: 'locks', channel, data: { action: 'unlock', resource, client: ws.client, session: ws.session } }, ws)
  }
}

function getLocks (ws, channel) {
  let channelIndex = lockChannels.findIndex(lc => lc.filter === ws.filter && lc.channel === channel)
  if (channelIndex === -1) {
    channelIndex = lockChannels.length
    lockChannels.push({ filter: ws.filter, channel, resources: [], clients: new Set() })
  }

  const channelObj = lockChannels[channelIndex]
  channelObj.clients.add(ws)

  return channelObj.resources.map(({ type, resource, ws: { session, client } }) => ({ type, resource, session, client }))
}

function removeAllLocks (ws, { channel, resources, clients }) {
  for (let ri = 0; ri < resources.length; ri++) {
    if (resources[ri].ws === ws) {
      const [{ resource }] = resources.splice(ri, 1)
      broadcast(ws.filter, { type: 'locks', channel, data: { action: 'unlock', resource, client: ws.client, session: ws.session } }, ws)
      break
    }
  }
  clients.delete(ws)
}

function leaveLocks (ws, channel) {
  const channelIndex = lockChannels.findIndex(lc => lc.filter === ws.filter && lc.channel === channel)
  if (channelIndex === -1) {
    return
  }

  const channelObj = lockChannels[channelIndex]
  removeAllLocks(ws, channelObj)
  if (channelObj.clients.size === 0) {
    lockChannels.splice(channelIndex, 1)
  }
}

function onClose (ws) {
  for (let i = 0; i < lockChannels.length; i++) {
    const channelObj = lockChannels[i]
    if (channelObj.filter !== ws.filter) continue
    removeAllLocks(ws, channelObj)
    if (channelObj.clients.size === 0) {
      lockChannels.splice(i, 1)
      i--
    }
  }
}

const rpcObject = {
  methods: {
    lock, unlock, getLocks, leaveLocks
  },
  onClose
}

export default rpcObject
