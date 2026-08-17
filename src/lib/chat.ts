import { getChannelKey, getClientKey } from "./support.js"

type ChatStatus = {
  online: boolean
  typing: boolean
}

type ChatChannel = {
  channel: string
  filter: string
  clients: Map<NotificationSocket, ChatStatus>
}

type ChatNotification = {
  channel: string
  data: unknown
}

export class ChatManager implements NotificationRPCObject {

  constructor(readonly namespace = 'chat', ) {

  }

  private chatChannels: Map<string, ChatChannel> = new Map()

  private broadcast (filter: string, { channel, data }: ChatNotification, notificationSocket: NotificationSocket) {
    const channelKey = getChannelKey(filter, channel)
    const channelObj = this.chatChannels.get(channelKey)
    channelObj?.clients.forEach((status, client) => {
      if (client !== notificationSocket) {
        client.send({ type: this.namespace, channel, data })
      }
    })
  }

  join =  ({ channel }: { channel: string }, notificationSocket: NotificationSocket) => {
    const { filter } = notificationSocket
    let channelObj = this.chatChannels.get(getChannelKey(filter, channel))
    if (!channelObj) {
      channelObj = { channel, filter, clients: new Map() }
      this.chatChannels.set(getChannelKey(filter, channel), channelObj)
    }
    channelObj.clients.set(notificationSocket, { online: true, typing: false })
    this.broadcast(filter, { channel, data: { action: 'join', client: notificationSocket.client } }, notificationSocket)
    return {
      channel,
      clients: Array.from(channelObj.clients, ([socket, status]) => ({client: socket.client, status}))
    }
  }

  leave =  ({ channel }: { channel: string },notificationSocket: NotificationSocket) => {
    const { filter } = notificationSocket
    const channelObj = this.chatChannels.get(getChannelKey(filter, channel))
    if (!channelObj) return
    channelObj.clients.delete(notificationSocket)
    if (channelObj.clients.size === 0) {
      this.chatChannels.delete(getChannelKey(filter, channel))
    }
    this.broadcast(filter, { channel, data: { action: 'leave', client: notificationSocket.client } }, notificationSocket)
  }

  setTypingStatus ({ channel, typing }: { channel: string, typing: boolean }, notificationSocket: NotificationSocket) {
    const { filter } = notificationSocket
    const channelObj = this.chatChannels.get(getChannelKey(filter, channel))
    if (!channelObj) return
    channelObj.clients.set(notificationSocket, { online: true, typing })
    this.broadcast(filter, { channel, data: { action: 'typing', client: notificationSocket.client, typing } }, notificationSocket)
  }

  isClientInChannel (filter: string, channel: string, client: unknown): boolean {
    const channelObj = this.chatChannels.get(getChannelKey(filter, channel))
    if (!channelObj) return false
    const clientKey = getClientKey(filter, client)
    for (const [socket, status] of channelObj.clients) {
      if (clientKey === getClientKey(socket.filter, socket.client)) return true
    }
    return false
  }

  onClose (notificationSocket: NotificationSocket) {
    const { filter } = notificationSocket
    for (const channelObj of this.chatChannels.values()) {
      if (channelObj.filter === filter && channelObj.clients.has(notificationSocket)) {
        channelObj.clients.delete(notificationSocket)
        this.broadcast(filter, { channel: channelObj.channel, data: { action: 'leave', client: notificationSocket.client } }, notificationSocket)
      }
    }
  }

  readonly methods: NotificationRPCMethods = {
    join: this.join,
    leave: this.leave,
    setTypingStatus: this.setTypingStatus,
  }
}