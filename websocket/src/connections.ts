import { WebSocket } from 'ws'
import type { Connection, PendingRequest } from './types'

const connections = new Map<string, Connection>()
const pending = new Map<string, PendingRequest>()
let reqCounter = 0

export function nextRequestId(): string {
  const now = new Date()
  const ts = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return `req-${ts}-${++reqCounter}`
}

export function addConnection(fileKey: string, fileName: string, ws: WebSocket): Connection {
  const existing = connections.get(fileKey)
  if (existing) existing.ws.close()
  const conn: Connection = { ws, fileKey, fileName, isAlive: true }
  connections.set(fileKey, conn)
  return conn
}

export function removeConnection(fileKey: string): void {
  connections.delete(fileKey)
}

export function resolveConnection(fileKey?: string): Connection | undefined {
  if (fileKey && connections.has(fileKey)) return connections.get(fileKey)
  if (connections.size === 1) return connections.values().next().value
  return undefined
}

export function sendToPlugin(conn: Connection, requestId: string, command: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (conn.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Plugin socket not open'))
      return
    }
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('Request timed out after 30s'))
    }, 30000)
    pending.set(requestId, { resolve, reject, timer, fileKey: conn.fileKey })
    conn.ws.send(JSON.stringify({ type: 'request', requestId, command, params }))
  })
}

export function resolveRequest(requestId: string, data: unknown, error?: string): void {
  const p = pending.get(requestId)
  if (!p) return
  clearTimeout(p.timer)
  if (error) p.reject(new Error(error))
  else p.resolve(data)
  pending.delete(requestId)
}

export function rejectPendingFor(fileKey: string, reason: string): void {
  for (const [id, p] of pending) {
    if (p.fileKey !== fileKey) continue
    clearTimeout(p.timer)
    p.reject(new Error(reason))
    pending.delete(id)
  }
}

export function pingAll(): void {
  for (const [key, conn] of connections) {
    if (conn.isAlive === false) {
      conn.ws.terminate()
      connections.delete(key)
      continue
    }
    conn.isAlive = false
    conn.ws.send(JSON.stringify({ type: 'ping' }))
  }
}
