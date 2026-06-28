import { z } from 'zod'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { rpc } from '../rpc'
import { toolSchemas } from './schemas'
import { postprocess } from './postprocess'
import { cacheGet, cacheSet, cacheInvalidate } from './cache'

const CACHE_TTL: Partial<Record<string, number>> = {
  get_metadata: 30_000,
  get_styles: 60_000,
  get_variables: 60_000,
  get_fonts: 60_000,
  get_colors: 30_000,
  get_variable_tokens: 60_000,
  get_typography_tokens: 60_000,
}

const MUTATION_TOOLS = new Set(['set_text_content', 'set_node_visibility', 'set_solid_fill', 'create_text', 'set_node_properties'])
const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE'])

export function registerToolHandler(srv: Server): void {
  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const raw = (args || {}) as Record<string, unknown>

    try {
      const schema = toolSchemas[name as keyof typeof toolSchemas]
      if (!schema) throw new Error(`Unknown tool: ${name}`)
      const parsed = schema.parse(raw) as Record<string, unknown>
      const fileKey = parsed.fileKey as string | undefined

      const cacheTtl = CACHE_TTL[name]
      const cacheKey = `${fileKey ?? 'default'}:${name}:${JSON.stringify(parsed)}`
      if (cacheTtl !== undefined) {
        const cached = cacheGet(cacheKey)
        if (cached !== undefined) {
          return { content: [{ type: 'text', text: postprocess(name, cached) }] }
        }
      }

      let data: unknown
      switch (name) {
        case 'get_document':
          data = await rpc('get_document', { depth: parsed.depth ?? 3, maxNodes: parsed.maxNodes ?? 500 }, fileKey)
          break
        case 'get_selection':
          data = await rpc('get_selection', {}, fileKey)
          break
        case 'get_node':
          data = await rpc('get_node', { nodeId: parsed.nodeId, maxNodes: parsed.maxNodes }, fileKey)
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
          data = await rpc('get_screenshot', { nodeIds: parsed.nodeIds, nodeId: parsed.nodeId, format: parsed.format ?? 'PNG', scale: parsed.scale ?? 2 }, fileKey)
          break
        case 'get_image':
          data = await rpc('get_image', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'get_svg':
          data = await rpc('get_svg', { nodeIds: parsed.nodeIds, nodeId: parsed.nodeId }, fileKey)
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
        case 'get_node_full': {
          let maxNodes = 500
          let result: unknown
          while (true) {
            result = await rpc('get_node', { nodeId: parsed.nodeId, maxNodes }, fileKey)
            if (!(result as { truncated?: boolean }).truncated || maxNodes >= 5000) break
            maxNodes = Math.min(maxNodes * 2, 5000)
          }
          data = result
          break
        }
        case 'get_slice_spec': {
          const nodeId = parsed.nodeId as string
          let maxNodes = 500
          let nodeResult: unknown
          while (true) {
            nodeResult = await rpc('get_node', { nodeId, maxNodes }, fileKey)
            if (!(nodeResult as { truncated?: boolean }).truncated || maxNodes >= 5000) break
            maxNodes = Math.min(maxNodes * 2, 5000)
          }
          const collectVectors = (n: Record<string, unknown>, acc: string[]) => {
            if (VECTOR_TYPES.has(n.type as string) && n.id) acc.push(n.id as string)
            if (Array.isArray(n.children)) (n.children as Record<string, unknown>[]).forEach(c => collectVectors(c, acc))
          }
          const vectorIds: string[] = []
          const rootNode = (nodeResult as { node?: Record<string, unknown> }).node
          if (rootNode) collectVectors(rootNode, vectorIds)
          const [layoutResult, svgResult] = await Promise.all([
            rpc('get_layout_spec', { nodeId }, fileKey).catch(() => null),
            vectorIds.length > 0 ? rpc('get_svg', { nodeIds: vectorIds }, fileKey).catch(() => null) : Promise.resolve(null),
          ])
          data = {
            ...(nodeResult as object),
            layout: layoutResult,
            svgs: (svgResult as { svgs?: unknown } | null)?.svgs ?? [],
          }
          break
        }
        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      if (cacheTtl !== undefined) cacheSet(cacheKey, data, cacheTtl)
      if (MUTATION_TOOLS.has(name)) cacheInvalidate(fileKey ?? 'default')

      return { content: [{ type: 'text', text: postprocess(name, data) }] }
    } catch (e) {
      if (e instanceof z.ZodError) {
        const issues = (e as unknown as { issues: Array<{ path: (string | number)[]; message: string }> }).issues
        const msg = issues.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ')
        return { content: [{ type: 'text', text: `Validation error: ${msg}` }], isError: true }
      }
      const errMsg = (e as Error).message
      const lc = errMsg.toLowerCase()
      let hint = ''
      if (lc.includes('no figma plugin') || lc.includes('not connected') || lc.includes('econnrefused')) {
        hint = '\n\n[HINT] Plugin disconnected — reopen the Figma plugin panel and ensure it shows "Connected" before retrying.'
      } else if (lc.includes('timed out') || lc.includes('timeout')) {
        hint = '\n\n[HINT] Request timed out — the Figma plugin may be processing a large file. Try again or narrow scope with specific nodeIds.'
      }
      return { content: [{ type: 'text', text: errMsg + hint }], isError: true }
    }
  })
}
