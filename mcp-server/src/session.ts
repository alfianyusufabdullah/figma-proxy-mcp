import http from 'http'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createServer } from './server'

interface SessionEntry {
  transport: SSEServerTransport
}

const sessions = new Map<string, SessionEntry>()

export async function handleSse(res: http.ServerResponse): Promise<void> {
  const transport = new SSEServerTransport('/messages', res)
  const server = createServer()
  sessions.set(transport.sessionId, { transport })
  res.on('close', () => sessions.delete(transport.sessionId))
  await server.connect(transport)
}

export async function handleMessages(req: http.IncomingMessage, res: http.ServerResponse, sessionId: string | null): Promise<void> {
  const entry = sessionId ? sessions.get(sessionId) : undefined
  if (!entry) {
    res.writeHead(400)
    res.end('No session found')
    return
  }
  await entry.transport.handlePostMessage(req, res)
}
