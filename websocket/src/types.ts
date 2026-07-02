import { WebSocket } from 'ws'

export interface Connection {
  ws: WebSocket
  fileKey: string
  fileName: string
  isAlive: boolean
}

export interface PendingRequest {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
  fileKey: string
}
