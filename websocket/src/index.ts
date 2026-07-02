import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { serve } from '@hono/node-server'
import { app } from './routes'
import { pingAll } from './connections'
import { createWss } from './wss'

const port = 3000
const server = serve({ fetch: app.fetch, port })
const wss = createWss()

const pingInterval = setInterval(pingAll, 30000)

server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

process.on('SIGINT', () => { clearInterval(pingInterval); process.exit() })
process.on('SIGTERM', () => { clearInterval(pingInterval); process.exit() })

console.log(`WebSocket proxy running on http://localhost:${port}`)
