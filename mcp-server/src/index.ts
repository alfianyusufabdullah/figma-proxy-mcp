import http from 'http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000'
const MCP_PORT = Number(process.env.MCP_PORT) || 3001

async function rpc(command: string, params?: Record<string, unknown>, fileKey?: string) {
  const body: Record<string, unknown> = { command }
  if (params) body.params = params
  if (fileKey) body.fileKey = fileKey

  const res = await fetch(`${PROXY_URL}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const NodeIdSchema = z.string().min(1)
const FileKeySchema = z.string().optional()
const DepthSchema = z.number().int().min(0).max(10).optional()
const FormatSchema = z.enum(['PNG', 'SVG', 'JPG', 'PDF']).optional()
const ScaleSchema = z.number().min(0.5).max(4).optional()

const toolSchemas = {
  get_document: z.object({
    depth: DepthSchema,
    fileKey: FileKeySchema,
  }),
  get_selection: z.object({
    fileKey: FileKeySchema,
  }),
  get_node: z.object({
    nodeId: NodeIdSchema,
    fileKey: FileKeySchema,
  }),
  get_styles: z.object({
    fileKey: FileKeySchema,
  }),
  get_metadata: z.object({
    fileKey: FileKeySchema,
  }),
  get_design_context: z.object({
    nodeIds: z.array(NodeIdSchema).optional(),
    depth: DepthSchema,
    fileKey: FileKeySchema,
  }),
  get_variables: z.object({
    fileKey: FileKeySchema,
  }),
  get_screenshot: z.object({
    nodeIds: z.array(NodeIdSchema).optional(),
    nodeId: NodeIdSchema.optional(),
    format: FormatSchema,
    scale: ScaleSchema,
    fileKey: FileKeySchema,
  }),
}

const server = new Server(
  { name: 'figma-proxy-mcp', version: '0.2.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_document',
      description: 'Get the full node tree of the current Figma page',
      inputSchema: {
        type: 'object',
        properties: {
          depth: { type: 'number', description: 'Max depth to traverse. -1 = full tree, 0 = count only, 1+ = levels' },
          fileKey: { type: 'string', description: 'File key (omit if single file)' },
        },
      },
    },
    {
      name: 'get_selection',
      description: 'Get currently selected nodes in Figma',
      inputSchema: {
        type: 'object',
        properties: {
          fileKey: { type: 'string', description: 'File key (omit if single file)' },
        },
      },
    },
    {
      name: 'get_node',
      description: 'Get a specific Figma node by ID',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Node ID (e.g. 4029:12345)' },
          fileKey: { type: 'string', description: 'File key (omit if single file)' },
        },
        required: ['nodeId'],
      },
    },
    {
      name: 'get_styles',
      description: 'Get all local styles (paint, text, effect, grid)',
      inputSchema: {
        type: 'object',
        properties: {
          fileKey: { type: 'string', description: 'File key (omit if single file)' },
        },
      },
    },
    {
      name: 'get_metadata',
      description: 'Get file name, pages, current page, and file key',
      inputSchema: {
        type: 'object',
        properties: {
          fileKey: { type: 'string', description: 'File key (omit if single file)' },
        },
      },
    },
    {
      name: 'get_design_context',
      description: 'Get a depth-limited snapshot of the design (optimized for AI context)',
      inputSchema: {
        type: 'object',
        properties: {
          nodeIds: { type: 'array', items: { type: 'string' }, description: 'Target node IDs (omit for full page)' },
          depth: { type: 'number', description: 'Max depth (default 2)' },
          fileKey: { type: 'string', description: 'File key (omit if single file)' },
        },
      },
    },
    {
      name: 'get_variables',
      description: 'Get all variable collections, modes, and values',
      inputSchema: {
        type: 'object',
        properties: {
          fileKey: { type: 'string', description: 'File key (omit if single file)' },
        },
      },
    },
    {
      name: 'get_screenshot',
      description: 'Export nodes as PNG/SVG images (base64-encoded)',
      inputSchema: {
        type: 'object',
        properties: {
          nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to export (omit for current selection)' },
          nodeId: { type: 'string', description: 'Single node ID to export' },
          format: { type: 'string', enum: ['PNG', 'SVG', 'JPG', 'PDF'], description: 'Export format (default PNG)' },
          scale: { type: 'number', description: 'Scale factor (default 2)' },
          fileKey: { type: 'string', description: 'File key (omit if single file)' },
        },
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const raw = (args || {}) as Record<string, unknown>

  try {
    const schema = toolSchemas[name as keyof typeof toolSchemas]
    if (!schema) throw new Error(`Unknown tool: ${name}`)
    const parsed = schema.parse(raw) as Record<string, unknown>
    const fileKey = parsed.fileKey as string | undefined

    let data: unknown
    switch (name) {
      case 'get_document':
        data = await rpc('get_document', { depth: parsed.depth ?? -1 }, fileKey)
        break
      case 'get_selection':
        data = await rpc('get_selection', {}, fileKey)
        break
      case 'get_node':
        data = await rpc('get_node', { nodeId: parsed.nodeId }, fileKey)
        break
      case 'get_styles':
        data = await rpc('get_styles', {}, fileKey)
        break
      case 'get_metadata':
        data = await rpc('get_metadata', {}, fileKey)
        break
      case 'get_design_context':
        data = await rpc('get_design_context', { nodeIds: parsed.nodeIds, depth: parsed.depth ?? 2 }, fileKey)
        break
      case 'get_variables':
        data = await rpc('get_variables', {}, fileKey)
        break
      case 'get_screenshot':
        data = await rpc('get_screenshot', {
          nodeIds: parsed.nodeIds,
          nodeId: parsed.nodeId,
          format: parsed.format ?? 'PNG',
          scale: parsed.scale ?? 2,
        }, fileKey)
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  } catch (e) {
    if (e instanceof z.ZodError) {
      const issues = (e as unknown as { issues: Array<{ path: (string | number)[]; message: string }> }).issues
      const msg = issues.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ')
      return { content: [{ type: 'text', text: `Validation error: ${msg}` }], isError: true }
    }
    return { content: [{ type: 'text', text: (e as Error).message }], isError: true }
  }
})

const transports: Map<string, SSEServerTransport> = new Map()
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (url.pathname === '/sse') {
    const transport = new SSEServerTransport('/messages', res)
    transports.set(transport.sessionId, transport)
    res.on('close', () => transports.delete(transport.sessionId))
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
