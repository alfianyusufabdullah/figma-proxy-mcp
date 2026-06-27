import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { WebSocket, WebSocketServer } from 'ws'

interface Snapshot {
  nodes: unknown[]
  styles: unknown[]
  variables: unknown[]
  selection: unknown[]
  assets: Map<string, unknown>
}

const app = new Hono()
const snapshot: Snapshot = {
  nodes: [],
  styles: [],
  variables: [],
  selection: [],
  assets: new Map(),
}

const clients: Set<WebSocket> = new Set()
const pendingExports: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = new Map()

function broadcast(msg: object) {
  const data = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }
}

app.use('/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }))

app.get('/tree', (c) => {
  const nodeId = c.req.query('nodeId')
  if (nodeId) {
    const find = (nodes: unknown[]): unknown | null => {
      for (const n of nodes as Array<Record<string, unknown>>) {
        if (n.id === nodeId) return n
        if (n.children) {
          const found = find(n.children as unknown[])
          if (found) return found
        }
      }
      return null
    }
    return c.json(find(snapshot.nodes))
  }
  return c.json(snapshot.nodes)
})

app.get('/styles', (c) => c.json(snapshot.styles))
app.get('/variables', (c) => c.json(snapshot.variables))
app.get('/selection', (c) => c.json(snapshot.selection))

app.get('/asset', async (c) => {
  const nodeId = c.req.query('nodeId')
  if (!nodeId) return c.json(null, 400)

  if (snapshot.assets.has(nodeId)) {
    return c.json({ nodeId, data: snapshot.assets.get(nodeId) })
  }

  broadcast({ type: 'request_export', nodeId })

  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('export timeout')), 15000)
      pendingExports.set(nodeId, { resolve, reject, timer })
    })
    return c.json({ nodeId, data: result })
  } catch {
    return c.json(null, 404)
  }
})

app.get('/health', (c) => c.json({ ok: true }))

app.post('/snapshot', async (c) => {
  const body = await c.req.json()
  if (body.nodes) snapshot.nodes = body.nodes
  if (body.styles) snapshot.styles = body.styles
  if (body.variables) snapshot.variables = body.variables
  if (body.selection) snapshot.selection = body.selection
  return c.json({ ok: true })
})

app.post('/asset', async (c) => {
  const body = await c.req.json()
  if (body.nodeId) {
    snapshot.assets.set(body.nodeId, body)
    const p = pendingExports.get(body.nodeId)
    if (p) {
      clearTimeout(p.timer)
      p.resolve(body)
      pendingExports.delete(body.nodeId)
    }
  }
  return c.json({ ok: true })
})

const port = 3000
const server = serve({ fetch: app.fetch, port })

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws) => {
  console.log('WebSocket connected')
  clients.add(ws)

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'snapshot' && msg.payload) {
        if (msg.payload.nodes) snapshot.nodes = msg.payload.nodes
        if (msg.payload.styles) snapshot.styles = msg.payload.styles
        if (msg.payload.variables) snapshot.variables = msg.payload.variables
        if (msg.payload.selection) snapshot.selection = msg.payload.selection
      }
      if (msg.type === 'asset' && msg.payload) {
        snapshot.assets.set(msg.payload.nodeId, msg.payload)
        const p = pendingExports.get(msg.payload.nodeId)
        if (p) {
          clearTimeout(p.timer)
          p.resolve(msg.payload)
          pendingExports.delete(msg.payload.nodeId)
        }
      }
    } catch {
      // ignore malformed messages
    }
  })

  ws.on('close', () => {
    console.log('WebSocket disconnected')
    clients.delete(ws)
  })

  ws.on('error', () => {
    clients.delete(ws)
  })
})

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

console.log(`Proxy server running on http://localhost:${port}`)
