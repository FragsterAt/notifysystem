type IncomingMessage = import('node:http').IncomingMessage
type NotificationSocket = import('@/lib/notificationSocket.ts').NotificationSocket

type RequestListenerOptions = {
  authorize: (IncomingMessage) => Promise<boolean> | boolean
  statusResponse: (ServerResponse) => unknown
  onRequest: ((IncomingMessage) => Promise<void> | void) | undefined
}

type NotificationChannel = {
  channel: string
  filter: string
  clients: Set<NotificationSocket>
}

interface NotificationTypeParams {
  type: 'params'
  data: {
    filter: string
    session?: string
    client: unknown
    broadcastFilter?: string
    listenBroadcast?: boolean
  }
}

interface NotificationTypeCommon {
  type: 'message' | 'broadcast-message'
  data: unknown
}

interface NotificationTypeOneCNotifyTypeChanged {
  type: 'notify-type-changed'
  data: string // То, что можно передать в "Тип()"
}

interface NotificationTypeOneCNotifyChanged {
  type: 'notify-changed'
  data: string // То, что можно передать в "ОповеститьОбИзменении()", сериализованное с помощью СериализаторXDTO.ЗаписатьXML
}

interface NotificationTypeOneCNotify {
  type: 'notify'
  data: string // Структура("ИмяСобытия, Параметр, Источник"), используемая как параметры в "Оповестить()", сериализованная с помощью СериализаторXDTO.ЗаписатьXML
}

interface NotificationTypeOneCNavigationLink {
  type: 'navigation-link'
  data: string // Навигационная ссылка 1с
}

interface NotificationTypeOneCUserAlert {
  type: 'user-alert'
  data: string // Структура("Текст, НавигационнаяСсылка, Пояснение, Картинка, Картинка, Статус, КлючУникальности"), используемая как параметры ПоказатьОповещениеПользователя(), , сериализованная с помощью СериализаторXDTO.ЗаписатьXML
}

type OneCMessage = NotificationTypeOneCNotifyTypeChanged | NotificationTypeOneCNotifyChanged | NotificationTypeOneCNotify | NotificationTypeOneCNavigationLink | NotificationTypeOneCUserAlert

interface NotificationTypeChannel {
  type: 'join' | 'leave'
  channel: string
}

interface NotificationTypeJsonRPC {
  type: 'rpc'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

interface NotificationTypeJsonRPCResponse {
  type: 'rpc-result'
  id: string | number
  error: {code: number?, message: string} | undefined
  result: unknown | undefined
}

type BaseMessage = {
  channel: string | null
  timeout: number | null
  self: ?boolean,
  session: ?string
}

type NotificationMessage = BaseMessage & (NotificationTypeJsonRPC | NotificationTypeParams | NotificationTypeCommon | NotificationTypeChannel | OneCMessage | NotificationTypeJsonRPC)
type DataMessage = BaseMessage & (NotificationTypeCommon | OneCMessage)
type RpcMessage = BaseMessage & (NotificationTypeJsonRPC)


type NotificationPendingMessage = {
  type: string
  filter: string
  channel: string | null
  data: unknown
  till: number
  self: ?boolean
}

type NotificationRPCMethod = (param: any, socket: NotificationSocket) => unknown

type NotificationRPCMethods = Record<string, NotificationRPCMethod>

interface NotificationRPCObject {
  methods: NotificationRPCMethods
  onClose?: (socket: NotificationSocket) => void
}
