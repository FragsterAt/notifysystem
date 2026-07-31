import { isEqual } from 'lodash-es'
import { NotificationSocket } from './notificationSocket.js'

type LockChannel = {
  clients: Set<NotificationSocket>
  filter: string
  channel: string
  resources: LockResource[]
}
type LockType = 's' | 'x'
type LockParams = {
  channel: string
  type: LockType
  resource: unknown
}
type UnlockParams = {
  channel: string
  resource: unknown
}
type LockResource = {
  resource: unknown
  notificationSocket: NotificationSocket
  type: LockType
}
type LockMessage = {
  channel: string
  data: {
    action: 'lock'
    type: LockType
    resource: unknown
    client: unknown
    session: string
  }
}
type UnlockMessage = {
  channel: string
  data: {
    action: 'unlock'
    resource: unknown
    client: unknown
    session: string
  }
}


class RpcLockManager implements NotificationRPCObject {
  constructor(readonly namespace = 'locks') {
  }

  private lockChannels: LockChannel[] = []

  private broadcast (filter: string, { channel, data }: LockMessage | UnlockMessage, notificationSocket: NotificationSocket) {
    const channelObj = this.lockChannels.find(el => el.channel === channel && el.filter === filter)
    channelObj?.clients.forEach(client => {
      if (client !== notificationSocket) {
        client.send({ type: this.namespace, channel, data })
      }
    })
  }

  lock (notificationSocket: NotificationSocket, { channel, resource, type }: LockParams) {
    let channelIndex = this.lockChannels.findIndex(lc => lc.filter === notificationSocket.filter && lc.channel === channel)
    if (channelIndex === -1) {
      channelIndex = this.lockChannels.length
      this.lockChannels.push({ filter: notificationSocket.filter, channel, resources: [], clients: new Set<NotificationSocket>() })
    }

    const channelObj = this.lockChannels[channelIndex]
    const resourceLocks = channelObj.resources.filter(r => {
      return isEqual(r.resource, resource)
    })
    if (type === 'x' && resourceLocks.some(r => r.notificationSocket !== notificationSocket)) { // хотим установить эксклюзив, но есть другие блокировки
      throw new Error()
    } else if (type === 's' && resourceLocks.some(r => r.type === 'x' && r.notificationSocket !== notificationSocket)) { // хотим установить разделяемую, но есть эксклюзивная
      throw new Error()
    } else {
      const lock = resourceLocks.find(r => {
        // console.log(r.ws.session, ws.session, r.ws === ws)
        return r.notificationSocket === notificationSocket
      })
      // console.log(lock)
      if (lock) {
        lock.type = type
      } else {
        channelObj.resources.push({ notificationSocket: notificationSocket, type, resource })
      }
    }
    this.broadcast(notificationSocket.filter, { channel, data: { action: 'lock', type, resource, client: notificationSocket.client, session: notificationSocket.session } }, notificationSocket)
    return { type, resource, client: notificationSocket.client, session: notificationSocket.session }
  }
  unlock (notificationSocket: NotificationSocket, { channel, resource }: UnlockParams) {
    const channelIndex = this.lockChannels.findIndex(lc => lc.filter === notificationSocket.filter && lc.channel === channel)
    if (channelIndex === -1) return
    const channelObj = this.lockChannels[channelIndex]
    const index = channelObj.resources.findIndex(r => r.notificationSocket === notificationSocket && isEqual(r.resource, resource))

    if (index !== 0) {
      channelObj.resources.splice(index, 1)
      this.broadcast(notificationSocket.filter, { channel, data: { action: 'unlock', resource, client: notificationSocket.client, session: notificationSocket.session } }, notificationSocket)
    }
  }

  getLocks (notificationSocket: NotificationSocket, channel: string) {
    let channelIndex = this.lockChannels.findIndex(lc => lc.filter === notificationSocket.filter && lc.channel === channel)
    if (channelIndex === -1) {
      channelIndex = this.lockChannels.length
      this.lockChannels.push({ filter: notificationSocket.filter, channel, resources: [], clients: new Set() })
    }

    const channelObj = this.lockChannels[channelIndex]
    channelObj.clients.add(notificationSocket)

    return channelObj.resources.map(({ type, resource, notificationSocket: { session, client } }) => ({ type, resource, session, client }))
  }

  // Снимает все блокировки notificationSocket из канала
  removeAllLocks (notificationSocket: NotificationSocket, { channel, resources, clients }: LockChannel) {
    for (let ri = 0; ri < resources.length; ri++) {
      if (resources[ri].notificationSocket === notificationSocket) {
        const [{ resource }] = resources.splice(ri, 1)
        this.broadcast(notificationSocket.filter, { channel, data: { action: 'unlock', resource, client: notificationSocket.client, session: notificationSocket.session } }, notificationSocket)
        break
      }
    }
    clients.delete(notificationSocket)
  }

  leaveLocks (notificationSocket: NotificationSocket, channel: string) {
    const channelIndex = this.lockChannels.findIndex(lc => lc.filter === notificationSocket.filter && lc.channel === channel)
    if (channelIndex === -1) {
      return
    }

    const channelObj = this.lockChannels[channelIndex]
    this.removeAllLocks(notificationSocket, channelObj)
    if (channelObj.clients.size === 0) {
      this.lockChannels.splice(channelIndex, 1)
    }
  }

  public onClose (notificationSocket: NotificationSocket) {
    for (let i = 0; i < this.lockChannels.length; i++) {
      const channelObj = this.lockChannels[i]
      if (channelObj.filter !== notificationSocket.filter) continue

      this.removeAllLocks(notificationSocket, channelObj)
      if (channelObj.clients.size === 0) {
        this.lockChannels.splice(i, 1)
        i--
      }
    }
  }

  public get methods () {
    return {
      lock: this.lock,
      unlock: this.unlock,
      getLocks: this.getLocks,
      leaveLocks: this.leaveLocks
    }
  }
}

export default RpcLockManager