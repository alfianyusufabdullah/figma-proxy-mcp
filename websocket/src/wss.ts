import { WebSocketServer, type RawData } from 'ws'
import { addConnection, removeConnection, resolveRequest, rejectPendingFor } from './connections'
import { isValidApiKey } from './apiKeys'
import { isIncomingWsMessage } from './types'

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data)
  if (Buffer.isBuffer(data)) return data
  return Buffer.from(data)
}

export function createWss(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathParts = url.pathname.split('/').filter(Boolean)
    if (pathParts.length < 1) {
      ws.close(4001, 'Missing apiKey in path')
      return
    }
    const apiKey = pathParts[0]
    if (!isValidApiKey(apiKey)) {
      ws.close(4003, 'Unknown apiKey. Generate one via GET /generate-apikey on the MCP server.')
      return
    }
    const fileKey = url.searchParams.get('fileKey') || 'default'
    const fileName = url.searchParams.get('fileName') || 'Unknown'

    const conn = addConnection(apiKey, fileKey, fileName, ws)
    console.log(`Plugin connected: ${fileName} (${apiKey.slice(0, 8)}...:${fileKey})`)

    ws.on('message', (raw) => {
      try {
        const msg: unknown = JSON.parse(toBuffer(raw).toString())
        if (!isIncomingWsMessage(msg)) return
        if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return }
        if (msg.type === 'pong') { conn.isAlive = true; return }
        if (msg.type === 'response') resolveRequest(msg.requestId, msg.data, msg.error)
      } catch {
        /* ignore malformed message */
      }
    })

    ws.on('close', () => {
      removeConnection(apiKey, fileKey)
      console.log(`Plugin disconnected: ${fileName}`)
      rejectPendingFor(apiKey, fileKey, 'Plugin disconnected')
    })

    ws.on('error', () => { removeConnection(apiKey, fileKey) })
  })

  return wss
}
