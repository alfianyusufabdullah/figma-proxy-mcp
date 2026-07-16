import { WebSocket } from 'ws'

export interface Connection {
  ws: WebSocket
  apiKey: string
  fileKey: string
  fileName: string
  isAlive: boolean
}

export interface PendingRequest {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
  apiKey: string
  fileKey: string
}

export interface PingMessage {
  type: 'ping'
}

export interface PongMessage {
  type: 'pong'
}

export interface ResponseMessage {
  type: 'response'
  requestId: string
  data?: unknown
  error?: string
}

export type IncomingWsMessage = PingMessage | PongMessage | ResponseMessage

export function isIncomingWsMessage(value: unknown): value is IncomingWsMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const { type } = value
  if (type === 'ping' || type === 'pong') return true
  if (type === 'response') return 'requestId' in value && typeof value.requestId === 'string'
  return false
}
