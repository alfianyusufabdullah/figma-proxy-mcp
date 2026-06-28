import http from 'http'
import { MCP_PORT } from './config'
import { handleSse, handleMessages } from './session'

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (url.pathname === '/sse') { await handleSse(res); return }

  if (url.pathname === '/messages') {
    await handleMessages(req, res, url.searchParams.get('sessionId'))
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

httpServer.listen(MCP_PORT, () => {
  console.log(`MCP SSE server running on http://localhost:${MCP_PORT}/sse`)
})
