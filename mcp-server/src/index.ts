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
    maxNodes: z.number().int().min(10).max(5000).optional(),
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
    maxNodes: z.number().int().min(10).max(5000).optional(),
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
  get_image: z.object({
    nodeId: NodeIdSchema,
    fileKey: FileKeySchema,
  }),
  get_css: z.object({
    nodeId: NodeIdSchema,
    fileKey: FileKeySchema,
  }),
  get_fonts: z.object({
    fileKey: FileKeySchema,
  }),
  get_colors: z.object({
    fileKey: FileKeySchema,
  }),
  find_text_nodes: z.object({
    keyword: z.string().optional(),
    regex: z.string().optional(),
    fileKey: FileKeySchema,
  }),
  get_text_content: z.object({
    page: z.string().optional(),
    fileKey: FileKeySchema,
  }),
  set_text_content: z.object({
    nodeId: NodeIdSchema,
    text: z.string(),
    fileKey: FileKeySchema,
  }),
  set_node_visibility: z.object({
    nodeIds: z.array(NodeIdSchema),
    visible: z.boolean(),
    fileKey: FileKeySchema,
  }),
  set_solid_fill: z.object({
    nodeId: NodeIdSchema,
    color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    opacity: z.number().min(0).max(1).optional(),
    fileKey: FileKeySchema,
  }),
  create_text: z.object({
    text: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
    fontSize: z.number().optional(),
    parentId: NodeIdSchema.optional(),
    fileKey: FileKeySchema,
  }),
  set_node_properties: z.object({
    nodeId: NodeIdSchema,
    name: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    fileKey: FileKeySchema,
  }),
  get_layout_spec: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_responsive_behavior: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_corner_radii: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_stroke_spec: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_effect_spec: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_component_properties: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_instance_overrides: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_variable_tokens: z.object({ fileKey: FileKeySchema }),
  get_node_variable_bindings: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  export_json: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  to_html: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  to_html_page: z.object({ page: z.string().optional(), fileKey: FileKeySchema }),
  get_text_segments: z.object({ nodeId: NodeIdSchema, fields: z.array(z.string()).optional(), fileKey: FileKeySchema }),
  detect_text_overflow: z.object({ page: z.string().optional(), fileKey: FileKeySchema }),
  find_placeholders: z.object({ fileKey: FileKeySchema }),
  check_text_consistency: z.object({ group_by: z.string().optional(), page: z.string().optional(), fileKey: FileKeySchema }),
  get_typography_tokens: z.object({ fileKey: FileKeySchema }),
}

const toolList = [
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
    name: 'get_image',
    description: 'Extract the actual image bytes from a node with an image fill',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID with an image fill' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_css',
    description: 'Get CSS properties of a node (width, flex, color, padding, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_fonts',
    description: 'List all fonts used in the document',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_colors',
    description: 'Extract all unique hex colors from fills and strokes in the document',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'find_text_nodes',
    description: 'Search text nodes by keyword or regex across all pages',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search keyword (case-insensitive)' },
        regex: { type: 'string', description: 'Regex pattern (optional, overrides keyword)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_text_content',
    description: 'Dump all text content from a specific page or all pages',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', description: 'Page name (omit for all pages)' },
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
  {
    name: 'set_text_content',
    description: 'Replace text content of a text node',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID of the text node' },
        text: { type: 'string', description: 'New text content' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId', 'text'],
    },
  },
  {
    name: 'set_node_visibility',
    description: 'Show or hide nodes',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to toggle visibility' },
        visible: { type: 'boolean', description: 'true = show, false = hide' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeIds', 'visible'],
    },
  },
  {
    name: 'set_solid_fill',
    description: 'Replace a node fill with a solid color',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID' },
        color: { type: 'string', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', description: 'Hex color (e.g. #ff0000)' },
        opacity: { type: 'number', description: 'Opacity 0-1 (optional)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId', 'color'],
    },
  },
  {
    name: 'create_text',
    description: 'Create a new text node',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text content' },
        x: { type: 'number', description: 'X position (optional)' },
        y: { type: 'number', description: 'Y position (optional)' },
        fontSize: { type: 'number', description: 'Font size (optional)' },
        parentId: { type: 'string', description: 'Parent frame ID (optional)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'set_node_properties',
    description: 'Change node name, position, size, or opacity',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID' },
        name: { type: 'string', description: 'New name (optional)' },
        x: { type: 'number', description: 'X position (optional)' },
        y: { type: 'number', description: 'Y position (optional)' },
        width: { type: 'number', description: 'Width (optional)' },
        height: { type: 'number', description: 'Height (optional)' },
        opacity: { type: 'number', description: 'Opacity 0-1 (optional)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_layout_spec',
    description: 'Get full auto-layout specification (direction, gap, padding, alignment, sizing)',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_responsive_behavior',
    description: 'Get constraints, layout alignment, grow, positioning, and min/max sizes',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_corner_radii',
    description: 'Get individual corner radii and corner smoothing',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_stroke_spec',
    description: 'Get full stroke specification including per-side weights, dash, cap, join',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_effect_spec',
    description: 'Get effects list with full shadow/blur details',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_component_properties',
    description: 'Get component/instance property definitions, current values, variant props, dev status',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Component/Instance node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_instance_overrides',
    description: 'Get instance overrides, exposed instances, main component',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Instance node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_variable_tokens',
    description: 'Get all variable collections, modes, and values (design tokens)',
    inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } } },
  },
  {
    name: 'get_node_variable_bindings',
    description: 'Get bound/inferred variables and resolved modes for a node',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'export_json',
    description: 'Export a node as JSON_REST_V1 (same format as Figma REST API)',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'to_html',
    description: 'Convert a Figma node to pre-HTML with inline CSS for quick implementation',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID to convert' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'to_html_page',
    description: 'Convert an entire Figma page to HTML document with inline CSS',
    inputSchema: { type: 'object', properties: { page: { type: 'string', description: 'Page name (omit for current page)' }, fileKey: { type: 'string' } } },
  },
  {
    name: 'get_text_segments',
    description: 'Get rich text segments with per-style breakdown (font, size, color, hyperlink, etc.)',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Text node ID' }, fields: { type: 'array', items: { type: 'string' } }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'detect_text_overflow',
    description: 'Find text nodes overflowing their clipped parent containers',
    inputSchema: { type: 'object', properties: { page: { type: 'string', description: 'Page name (omit for all pages)' }, fileKey: { type: 'string' } } },
  },
  {
    name: 'find_placeholders',
    description: 'Find placeholder text (lorem ipsum, {{braces}}, [brackets], "your text", etc.)',
    inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } } },
  },
  {
    name: 'check_text_consistency',
    description: 'Check text style consistency across the document',
    inputSchema: { type: 'object', properties: { group_by: { type: 'string', enum: ['page', 'fontSize', 'fontFamily'], description: 'Group results by (default: page)' }, page: { type: 'string', description: 'Filter by page name' }, fileKey: { type: 'string' } } },
  },
  {
    name: 'get_typography_tokens',
    description: 'Get all local text styles with full typography properties',
    inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } } },
  },
]

function createServer(): Server {
  const srv = new Server(
    { name: 'figma-proxy-mcp', version: '0.2.0' },
    { capabilities: { tools: {} } },
  )

  srv.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList }))

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
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
          data = await rpc('get_document', { depth: parsed.depth ?? 3, maxNodes: parsed.maxNodes ?? 500 }, fileKey)
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
          data = await rpc('get_design_context', { nodeIds: parsed.nodeIds, depth: parsed.depth ?? 2, maxNodes: parsed.maxNodes ?? 300 }, fileKey)
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
        case 'get_image':
          data = await rpc('get_image', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_css':
          data = await rpc('get_css', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_fonts':
          data = await rpc('get_fonts', {}, fileKey)
          break
        case 'get_colors':
          data = await rpc('get_colors', {}, fileKey)
          break
        case 'find_text_nodes':
          data = await rpc('find_text_nodes', { keyword: parsed.keyword, regex: parsed.regex }, fileKey)
          break
        case 'get_text_content':
          data = await rpc('get_text_content', { page: parsed.page }, fileKey)
          break
        case 'set_text_content':
          data = await rpc('set_text_content', { nodeId: parsed.nodeId, text: parsed.text }, fileKey)
          break
        case 'set_node_visibility':
          data = await rpc('set_node_visibility', { nodeIds: parsed.nodeIds, visible: parsed.visible }, fileKey)
          break
        case 'set_solid_fill':
          data = await rpc('set_solid_fill', { nodeId: parsed.nodeId, color: parsed.color, opacity: parsed.opacity }, fileKey)
          break
        case 'create_text':
          data = await rpc('create_text', { text: parsed.text, x: parsed.x, y: parsed.y, fontSize: parsed.fontSize, parentId: parsed.parentId }, fileKey)
          break
        case 'set_node_properties':
          data = await rpc('set_node_properties', { nodeId: parsed.nodeId, name: parsed.name, x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height, opacity: parsed.opacity }, fileKey)
          break
        case 'get_layout_spec':
          data = await rpc('get_layout_spec', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_responsive_behavior':
          data = await rpc('get_responsive_behavior', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_corner_radii':
          data = await rpc('get_corner_radii', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_stroke_spec':
          data = await rpc('get_stroke_spec', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_effect_spec':
          data = await rpc('get_effect_spec', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_component_properties':
          data = await rpc('get_component_properties', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_instance_overrides':
          data = await rpc('get_instance_overrides', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_variable_tokens':
          data = await rpc('get_variable_tokens', {}, fileKey)
          break
        case 'get_node_variable_bindings':
          data = await rpc('get_node_variable_bindings', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'export_json':
          data = await rpc('export_json', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'to_html':
          data = await rpc('to_html', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'to_html_page':
          data = await rpc('to_html_page', { page: parsed.page }, fileKey)
          break
        case 'get_text_segments':
          data = await rpc('get_text_segments', { nodeId: parsed.nodeId, fields: parsed.fields }, fileKey)
          break
        case 'detect_text_overflow':
          data = await rpc('detect_text_overflow', { page: parsed.page }, fileKey)
          break
        case 'find_placeholders':
          data = await rpc('find_placeholders', {}, fileKey)
          break
        case 'check_text_consistency':
          data = await rpc('check_text_consistency', { group_by: parsed.group_by, page: parsed.page }, fileKey)
          break
        case 'get_typography_tokens':
          data = await rpc('get_typography_tokens', {}, fileKey)
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

  return srv
}

const transports: Map<string, { transport: SSEServerTransport; server: Server }> = new Map()
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (url.pathname === '/sse') {
    const transport = new SSEServerTransport('/messages', res)
    const server = createServer()
    transports.set(transport.sessionId, { transport, server })
    res.on('close', () => transports.delete(transport.sessionId))
    await server.connect(transport)
    return
  }

  if (url.pathname === '/messages') {
    const sessionId = url.searchParams.get('sessionId')
    const entry = sessionId ? transports.get(sessionId) : undefined
    if (entry) {
      await entry.transport.handlePostMessage(req, res)
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
