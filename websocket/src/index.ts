import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { WebSocket, WebSocketServer } from 'ws'

interface Connection {
  ws: WebSocket
  fileKey: string
  fileName: string
  isAlive: boolean
}

const app = new Hono()
const connections = new Map<string, Connection>()
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()

let reqCounter = 0

function nextRequestId(): string {
  const now = new Date()
  const ts = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  return `req-${ts}-${++reqCounter}`
}

app.use('/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }))

app.get('/health', (c) => c.json({ ok: true }))

app.get('/rpc', async (c) => {
  const command = c.req.query('command')
  if (!command) return c.json({ error: 'command required' }, 400)

  const fileKey = c.req.query('fileKey') || undefined
  const paramsStr = c.req.query('params')
  let params: Record<string, unknown> = {}
  if (paramsStr) { try { params = JSON.parse(paramsStr) } catch { return c.json({ error: 'invalid params' }, 400) } }

  const requestId = nextRequestId()
  const conn = resolveConnection(fileKey)
  if (!conn) return c.json({ error: 'No Figma plugin connected. Run the plugin in Figma first.' }, 503)

  try {
    const data = await sendToPlugin(conn, requestId, command, params)
    return c.json(data)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 408)
  }
})

app.post('/rpc', async (c) => {
  const body = await c.req.json()
  const command = body.command as string
  if (!command) return c.json({ error: 'command required' }, 400)

  const fileKey = body.fileKey as string | undefined
  const params = (body.params as Record<string, unknown>) || {}
  const requestId = nextRequestId()

  const conn = resolveConnection(fileKey)
  if (!conn) return c.json({ error: 'No Figma plugin connected. Run the plugin in Figma first.' }, 503)

  try {
    const data = await sendToPlugin(conn, requestId, command, params)
    return c.json(data)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 408)
  }
})

function resolveConnection(fileKey?: string): Connection | undefined {
  if (fileKey && connections.has(fileKey)) return connections.get(fileKey)
  if (connections.size === 1) return connections.values().next().value
  if (connections.size === 0) return undefined
  return undefined
}

function sendToPlugin(conn: Connection, requestId: string, command: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('Request timed out after 30s'))
    }, 30000)
    pending.set(requestId, { resolve, reject, timer })
    conn.ws.send(JSON.stringify({ type: 'request', requestId, command, params }))
  })
}

const port = 3000
const server = serve({ fetch: app.fetch, port })

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const fileKey = url.searchParams.get('fileKey') || 'default'
  const fileName = url.searchParams.get('fileName') || 'Unknown'

  const existing = connections.get(fileKey)
  if (existing) {
    existing.ws.close()
    connections.delete(fileKey)
  }

  const conn: Connection = { ws, fileKey, fileName, isAlive: true }
  connections.set(fileKey, conn)
  console.log(`Plugin connected: ${fileName} (${fileKey})`)

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return }
      if (msg.type === 'pong') { conn.isAlive = true; return }

      if (msg.type === 'response') {
        const p = pending.get(msg.requestId)
        if (p) {
          clearTimeout(p.timer)
          if (msg.error) p.reject(new Error(msg.error))
          else p.resolve(msg.data)
          pending.delete(msg.requestId)
        }
      }
    } catch { }
  })

  ws.on('close', () => {
    connections.delete(fileKey)
    console.log(`Plugin disconnected: ${fileName}`)
    for (const [id, p] of pending) {
      p.reject(new Error('Plugin disconnected'))
      clearTimeout(p.timer)
      pending.delete(id)
    }
  })

  ws.on('error', () => { connections.delete(fileKey) })
})

const pingInterval = setInterval(() => {
  for (const [key, conn] of connections) {
    if (conn.isAlive === false) {
      conn.ws.terminate()
      connections.delete(key)
      continue
    }
    conn.isAlive = false
    conn.ws.send(JSON.stringify({ type: 'ping' }))
  }
}, 30000)

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

process.on('SIGINT', () => { clearInterval(pingInterval); process.exit() })
process.on('SIGTERM', () => { clearInterval(pingInterval); process.exit() })

console.log(`WebSocket proxy running on http://localhost:${port}`)
