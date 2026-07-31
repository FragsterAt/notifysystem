import { WebSocket } from 'ws'

export class NotificationSocket {
  constructor(private readonly ws: WebSocket) {

  }
  // Эти свойства устанавливаются при получении первого сообщения по сокету, с типом 'params'
  filter!: string
  channels: Set<string> = new Set
  session!: string // уид
  client!: unknown
  broadcastChannel!: string
  listenBroadcast!: boolean

  send (data: unknown) {
    this.ws.send(JSON.stringify(data))
  }

  sendError (data: unknown, error: unknown = undefined) {
    this.ws.send(JSON.stringify({ type: 'error', data, error }))
  }
}