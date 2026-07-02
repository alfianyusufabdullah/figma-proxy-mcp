import http from 'http'
import { randomUUID } from 'crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { MCP_PORT, MCP_API_KEY } from './config'
import { createServer } from './server'
import { serveFile } from './filestore'

interface SessionEntry {
  transport: StreamableHTTPServerTransport
}

const sessions = new Map<string, SessionEntry>()

function checkAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!MCP_API_KEY) return true
  const auth = req.headers['authorization']
  if (auth !== `Bearer ${MCP_API_KEY}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return false
  }
  return true
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (url.pathname.startsWith('/dl/')) {
    const id = url.pathname.slice(4)
    const file = serveFile(id)
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'File not found or expired (TTL: 10 min)' }))
      return
    }
    res.writeHead(200, { 'Content-Type': file.mimeType, 'Content-Length': file.data.length, 'Cache-Control': 'no-store' })
    res.end(file.data)
    return
  }

  if (url.pathname !== '/mcp') {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  if (!checkAuth(req, res)) return

  const sessionId = req.headers['mcp-session-id'] as string | undefined

  if (req.method === 'GET') {
    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(404)
      res.end('Session not found')
      return
    }
    await sessions.get(sessionId)!.transport.handleRequest(req, res)
    return
  }

  if (req.method === 'DELETE') {
    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.transport.close()
      sessions.delete(sessionId)
    }
    res.writeHead(200)
    res.end()
    return
  }

  if (req.method === 'POST') {
    const rawBody = await readBody(req)
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      res.writeHead(400)
      res.end('Invalid JSON')
      return
    }

    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.transport.handleRequest(req, res, parsed)
      return
    }

    if (sessionId && !sessions.has(sessionId)) {
      console.log(`Session miss: ${sessionId} (re-init expected)`)
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }))
      return
    }

    if (!isInitializeRequest(parsed)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad request: not an initialize request' }, id: null }))
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport })
        console.log(`Session initialized: ${id} (${sessions.size} active)`)
      },
    })

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId)
        console.log(`Session closed: ${transport.sessionId} (${sessions.size} active)`)
      }
    }

    const srv = createServer()
    await srv.connect(transport)
    await transport.handleRequest(req, res, parsed)
    return
  }

  res.writeHead(405)
  res.end('Method not allowed')
})

httpServer.listen(MCP_PORT, () => {
  console.log(`MCP server running on http://localhost:${MCP_PORT}/mcp`)
  if (MCP_API_KEY) console.log('API key auth enabled')
})
