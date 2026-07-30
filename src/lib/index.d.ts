import { IncomingMessage } from "node:http";

type RequestListenerOptions = { 
  authorize: (IncomingMessage) => Promise<boolean> | boolean
  statusResponse: (ServerResponse) => unknown 
  onRequest: (IncomingMessage) => Promise<void> | void, 
  onQuit: () => any
}

type NotificationChannel = { 
  channel: string, 
  filter: string, 
  clients: Set<any> 
}

type NotificationSocket = {
  filter: string, 
  channels: Set<string>, 
  send: (data: any) => void
}