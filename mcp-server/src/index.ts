import http from 'http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000'
const MCP_PORT = Number(process.env.MCP_PORT) || 3001

async function proxyGet(path: string) {
  const res = await fetch(`${PROXY_URL}${path}`)
  if (!res.ok) throw new Error(`Proxy ${res.status}: ${await res.text()}`)
  return res.json()
}

const server = new Server(
  { name: 'figma-proxy-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_nodes',
      description: 'Get full node tree from the Figma document',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Optional node ID to get subtree' },
        },
      },
    },
    {
      name: 'get_styles',
      description: 'Get all local styles (paint, text, effect, grid)',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_variables',
      description: 'Get all local variables and collections',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_selection',
      description: 'Get currently selected nodes in the Figma document',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'export_asset',
      description: 'Export a node as an image asset (PNG or SVG)',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Node ID to export' },
        },
        required: ['nodeId'],
      },
    },
    {
      name: 'health',
      description: 'Check if proxy server is reachable',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case 'get_nodes': {
      const path = args?.nodeId ? `/tree?nodeId=${args.nodeId}` : '/tree'
      const data = await proxyGet(path)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
    case 'get_styles': {
      const data = await proxyGet('/styles')
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
    case 'get_variables': {
      const data = await proxyGet('/variables')
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
    case 'get_selection': {
      const data = await proxyGet('/selection')
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
    case 'export_asset': {
      const nodeId = args?.nodeId as string
      const data = await proxyGet(`/asset?nodeId=${nodeId}`)
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
    case 'health': {
      const data = await proxyGet('/health')
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

const transports: Map<string, SSEServerTransport> = new Map()

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (url.pathname === '/sse') {
    const transport = new SSEServerTransport('/messages', res)
    transports.set(transport.sessionId, transport)
    res.on('close', () => {
      transports.delete(transport.sessionId)
    })
    await server.connect(transport)
    return
  }

  if (url.pathname === '/messages') {
    const sessionId = url.searchParams.get('sessionId')
    const transport = sessionId ? transports.get(sessionId) : undefined
    if (transport) {
      await transport.handlePostMessage(req, res)
    } else {
      res.writeHead(400)
      res.end('No session found')
    }
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

httpServer.listen(MCP_PORT, () => {
  console.log(`MCP SSE server running on http://localhost:${MCP_PORT}/sse`)
})
