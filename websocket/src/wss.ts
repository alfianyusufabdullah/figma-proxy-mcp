import { WebSocketServer } from 'ws'
import { addConnection, removeConnection, resolveRequest, rejectPendingFor } from './connections'

export function createWss(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const fileKey = url.searchParams.get('fileKey') || 'default'
    const fileName = url.searchParams.get('fileName') || 'Unknown'

    const conn = addConnection(fileKey, fileName, ws)
    console.log(`Plugin connected: ${fileName} (${fileKey})`)

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return }
        if (msg.type === 'pong') { conn.isAlive = true; return }
        if (msg.type === 'response') resolveRequest(msg.requestId, msg.data, msg.error)
      } catch (_e) {}
    })

    ws.on('close', () => {
      removeConnection(fileKey)
      console.log(`Plugin disconnected: ${fileName}`)
      rejectPendingFor(fileKey, 'Plugin disconnected')
    })

    ws.on('error', () => { removeConnection(fileKey) })
  })

  return wss
}
