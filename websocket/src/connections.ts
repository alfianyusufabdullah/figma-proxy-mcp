import { WebSocket } from 'ws'
import type { Connection, PendingRequest } from './types'

const connections = new Map<string, Connection>()
const pending = new Map<string, PendingRequest>()
let reqCounter = 0

function connKey(apiKey: string, fileKey: string): string {
  return `${apiKey}:${fileKey}`
}

export function nextRequestId(): string {
  const now = new Date()
  const ts = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return `req-${ts}-${++reqCounter}`
}

export function addConnection(apiKey: string, fileKey: string, fileName: string, ws: WebSocket): Connection {
  const key = connKey(apiKey, fileKey)
  const existing = connections.get(key)
  if (existing) existing.ws.close()
  const conn: Connection = { ws, apiKey, fileKey, fileName, isAlive: true }
  connections.set(key, conn)
  return conn
}

export function removeConnection(apiKey: string, fileKey: string): void {
  connections.delete(connKey(apiKey, fileKey))
}

export function resolveConnection(apiKey: string, fileKey?: string): Connection | undefined {
  if (fileKey) {
    return connections.get(connKey(apiKey, fileKey))
  }
  for (const [, conn] of connections) {
    if (conn.apiKey === apiKey) return conn
  }
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
    pending.set(requestId, { resolve, reject, timer, apiKey: conn.apiKey, fileKey: conn.fileKey })
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

export function rejectPendingFor(apiKey: string, fileKey: string, reason: string): void {
  const ck = connKey(apiKey, fileKey)
  for (const [id, p] of pending) {
    if (connKey(p.apiKey, p.fileKey) !== ck) continue
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
