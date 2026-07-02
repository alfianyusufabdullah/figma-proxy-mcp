import { z } from 'zod'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { MCP_PUBLIC_URL } from '../config'
import { storeFile } from '../filestore'
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { rpc } from '../rpc'
import { toolSchemas } from './schemas'
import { postprocess } from './postprocess'
import { cacheGet, cacheSet, cacheInvalidate } from './cache'
import { uniqueFileName, svgFileName, extractViewBox, transformNumbers, applyStylesFormat, countNodes, topSections } from './slice-transforms'

const CACHE_TTL: Partial<Record<string, number>> = {
  get_metadata: 30_000,
  get_styles: 60_000,
  get_variables: 60_000,
  get_fonts: 60_000,
  get_colors: 30_000,
  get_variable_tokens: 60_000,
  get_typography_tokens: 60_000,
}

function pngSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return undefined
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const MUTATION_TOOLS = new Set(['set_text_content', 'set_node_visibility', 'set_solid_fill', 'create_text', 'set_node_properties'])
const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE'])

/** Build a slice spec (tree + layout + SVGs). Optional disk-first output:
 *  outputDir writes SVGs to disk and returns metadata only; outputPath writes
 *  the whole spec to disk and returns a compact summary. stylesFormat/round
 *  shape the tree. Shared by the get_slice_spec tool and slice_bundle. */
async function buildSliceSpec(parsed: Record<string, unknown>, fileKey: string | undefined): Promise<unknown> {
  const nodeId = parsed.nodeId as string
  const excludeEmptyContainers = (parsed.excludeEmptyContainers as boolean | undefined) ?? true
  const includeOnlyExportable = parsed.includeOnlyExportable as boolean | undefined
  let maxNodes = 500
  let nodeResult: unknown
  while (true) {
    nodeResult = await rpc('get_node', { nodeId, maxNodes, excludeEmptyContainers, includeOnlyExportable }, fileKey)
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
  const rawSvgs = ((svgResult as { svgs?: Array<{ nodeId: string; name: string; type: string; svg: string }> } | null)?.svgs) ?? []

  const outputDir = parsed.outputDir as string | undefined
  const svgFilePrefix = parsed.svgFilePrefix as string | undefined
  const omitSvgs = parsed.omitSvgs as boolean | undefined
  let svgs: unknown[]
  let svgFallback: string | undefined
  if (omitSvgs) {
    svgs = []
  } else if (outputDir) {
    try {
      mkdirSync(outputDir, { recursive: true })
      const used = new Set<string>()
      svgs = rawSvgs.map(s => {
        const fileName = svgFileName(s.name, s.nodeId, used, svgFilePrefix)
        const filePath = join(outputDir, fileName)
        writeFileSync(filePath, s.svg, 'utf8')
        return { nodeId: s.nodeId, name: s.name, type: s.type, fileName, savedTo: filePath, viewBox: extractViewBox(s.svg), bytes: s.svg.length }
      })
    } catch (e) {
      svgFallback = `disk write failed (${(e as Error).message}); returning inline`
      svgs = rawSvgs
    }
  } else {
    svgs = rawSvgs
  }

  const round = parsed.round as boolean | undefined
  const precision = parsed.precision as number | undefined
  let tree = nodeResult as Record<string, unknown>
  if (round === true || precision !== undefined) {
    tree = transformNumbers(tree, round === true, precision ?? 2) as Record<string, unknown>
  }

  const stylesFormat = (parsed.stylesFormat as 'full' | 'compact' | 'classes' | undefined) ?? 'full'
  const styleClasses = applyStylesFormat(tree.node as Record<string, unknown> | undefined, stylesFormat)

  let data: unknown = {
    ...tree,
    layout: layoutResult,
    svgs,
    ...(styleClasses ? { styleClasses } : {}),
    ...(svgFallback ? { svgFallback } : {}),
  }

  const outputPath = parsed.outputPath as string | undefined
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8')
    const root = (data as { node?: Record<string, unknown> }).node
    data = {
      savedTo: outputPath,
      nodeCount: root ? countNodes(root) : 0,
      sections: topSections(root),
      assetRefs: svgs.map(s => ({ nodeId: (s as { nodeId?: unknown }).nodeId, fileName: (s as { fileName?: unknown }).fileName })).filter(a => a.fileName),
      truncated: (nodeResult as { truncated?: boolean }).truncated ?? false,
    }
  }
  return data
}

export function registerToolHandler(srv: Server): void {
  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const raw = (args || {})

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
          data = await rpc('get_node', { nodeId: parsed.nodeId, maxNodes: parsed.maxNodes, excludeEmptyContainers: parsed.excludeEmptyContainers, includeOnlyExportable: parsed.includeOnlyExportable }, fileKey)
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
        case 'get_screenshot': {
          const outputPath = parsed.outputPath as string | undefined
          const outputDir = parsed.outputDir as string | undefined
          const nodeIds = parsed.nodeIds as string[] | undefined
          data = await rpc('get_screenshot', { nodeIds, nodeId: parsed.nodeId, format: parsed.format ?? 'PNG', scale: parsed.scale ?? 2 }, fileKey)
          const screenshots = (data as { screenshots: Array<{ nodeId: string; data: string; format: string }> }).screenshots
          if (outputPath || outputDir) {
            if (outputPath && screenshots.length > 1) throw new Error('outputPath is for single-node exports. Use outputDir for multiple nodes.')
            const saved = screenshots.map(s => {
              const ext = s.format === 'SVG' ? 'svg' : s.format === 'PDF' ? 'pdf' : s.format === 'JPG' ? 'jpg' : 'png'
              const filePath = outputPath ?? join(outputDir!, `${s.nodeId.replace(/:/g, '-')}.${ext}`)
              mkdirSync(dirname(filePath), { recursive: true })
              if (s.format === 'SVG') writeFileSync(filePath, s.data, 'utf8')
              else writeFileSync(filePath, Buffer.from(s.data, 'base64'))
              return { nodeId: s.nodeId, savedTo: filePath, format: s.format }
            })
            data = { saved }
          } else {
            const mimeOf = (fmt: string) => fmt === 'SVG' ? 'image/svg+xml' : fmt === 'JPG' ? 'image/jpeg' : fmt === 'PDF' ? 'application/pdf' : 'image/png'
            data = {
              screenshots: screenshots.map(s => {
                if (s.format === 'SVG') return { nodeId: s.nodeId, format: s.format, svg: s.data }
                const buf = Buffer.from(s.data, 'base64')
                const id = storeFile(buf, mimeOf(s.format))
                const size = s.format === 'PNG' ? pngSize(buf) : undefined
                return { nodeId: s.nodeId, format: s.format, downloadUrl: `${MCP_PUBLIC_URL}/dl/${id}`, ...size }
              })
            }
          }
          break
        }
        case 'get_image': {
          const raw2 = await rpc('get_image', { nodeId: parsed.nodeId }, fileKey) as { nodeId: string; data: string; format: string }
          const id2 = storeFile(Buffer.from(raw2.data, 'base64'), 'image/png')
          data = { nodeId: raw2.nodeId, format: raw2.format, downloadUrl: `${MCP_PUBLIC_URL}/dl/${id2}` }
          break
        }
        case 'get_svg': {
          const outputPath = parsed.outputPath as string | undefined
          const outputDir = parsed.outputDir as string | undefined
          data = await rpc('get_svg', { nodeIds: parsed.nodeIds, nodeId: parsed.nodeId }, fileKey)
          if (outputPath || outputDir) {
            const { svgs } = data as { svgs: Array<{ nodeId: string; name: string; svg: string }> }
            if (outputPath && svgs.length > 1) throw new Error('outputPath is for single-node exports. Use outputDir for multiple nodes.')
            const used = new Set<string>()
            const saved = svgs.map(s => {
              const filePath = outputPath ?? join(outputDir!, svgFileName(s.name, s.nodeId, used))
              mkdirSync(dirname(filePath), { recursive: true })
              writeFileSync(filePath, s.svg, 'utf8')
              return { nodeId: s.nodeId, name: s.name, savedTo: filePath }
            })
            data = { saved }
          }
          break
        }
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
          data = await rpc('get_text_content', { nodeId: parsed.nodeId, page: parsed.page }, fileKey)
          break
        case 'set_text_content':
          data = await rpc('set_text_content', { nodeId: parsed.nodeId, text: parsed.text, updates: parsed.updates }, fileKey)
          break
        case 'set_node_visibility':
          data = await rpc('set_node_visibility', { nodeIds: parsed.nodeIds, visible: parsed.visible }, fileKey)
          break
        case 'set_solid_fill':
          data = await rpc('set_solid_fill', { nodeId: parsed.nodeId, color: parsed.color, opacity: parsed.opacity, updates: parsed.updates }, fileKey)
          break
        case 'create_text':
          data = await rpc('create_text', { text: parsed.text, x: parsed.x, y: parsed.y, fontSize: parsed.fontSize, parentId: parsed.parentId }, fileKey)
          break
        case 'set_node_properties':
          data = await rpc('set_node_properties', { nodeId: parsed.nodeId, name: parsed.name, x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height, opacity: parsed.opacity, updates: parsed.updates }, fileKey)
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
        case 'get_frame_summary':
          data = await rpc('get_frame_summary', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'check_text_consistency':
          data = await rpc('check_text_consistency', { group_by: parsed.group_by, page: parsed.page }, fileKey)
          break
        case 'get_typography_tokens':
          data = await rpc('get_typography_tokens', {}, fileKey)
          break
        case 'get_exportable_nodes':
          data = await rpc('get_exportable_nodes', { nodeId: parsed.nodeId }, fileKey)
          break
        case 'export_section_assets': {
          const outputDir = parsed.outputDir as string | undefined
          const format = (parsed.format as string | undefined) ?? 'PNG'
          const scale = (parsed.scale as number | undefined) ?? 2
          const prefix = parsed.prefix as string | undefined
          const ext = format === 'SVG' ? 'svg' : format === 'PDF' ? 'pdf' : format === 'JPG' ? 'jpg' : 'png'
          const mime = format === 'SVG' ? 'image/svg+xml' : format === 'JPG' ? 'image/jpeg' : format === 'PDF' ? 'application/pdf' : 'image/png'
          const usedNames = new Set<string>()
          const discovery = await rpc('get_exportable_nodes', { nodeId: parsed.nodeId }, fileKey) as {
            exportableNodes: Array<{ nodeId: string; name: string; type: string; parentName: string | null; hasImageFill: boolean }>
          }
          if (outputDir) mkdirSync(outputDir, { recursive: true })
          const exported: Array<{ nodeId: string; name: string; savedTo?: string; downloadUrl?: string }> = []
          const errors: Array<{ nodeId: string; name: string; error: string }> = []
          const manifest: Array<{ nodeId: string; fileName: string; nodeName: string; parentName: string | null; type: string; kind: string }> = []
          for (const node of discovery.exportableNodes) {
            try {
              const result = await rpc('get_screenshot', { nodeId: node.nodeId, format, scale }, fileKey) as {
                screenshots: Array<{ nodeId: string; data: string; format: string }>
              }
              const s = result.screenshots[0]
              if (!s) continue
              const fileName = uniqueFileName(node.name, node.nodeId, usedNames, ext, prefix)
              if (outputDir) {
                const filePath = join(outputDir, fileName)
                if (format === 'SVG') writeFileSync(filePath, s.data, 'utf8')
                else writeFileSync(filePath, Buffer.from(s.data, 'base64'))
                exported.push({ nodeId: node.nodeId, name: node.name, savedTo: filePath })
              } else {
                const dlId = format === 'SVG'
                  ? storeFile(s.data, mime)
                  : storeFile(Buffer.from(s.data, 'base64'), mime)
                exported.push({ nodeId: node.nodeId, name: node.name, downloadUrl: `${MCP_PUBLIC_URL}/dl/${dlId}` })
              }
              manifest.push({
                nodeId: node.nodeId, fileName, nodeName: node.name,
                parentName: node.parentName, type: node.type,
                kind: node.hasImageFill ? 'IMAGE' : 'VECTOR',
              })
            } catch (e) {
              errors.push({ nodeId: node.nodeId, name: node.name, error: (e as Error).message })
            }
          }
          data = { exported, errors, manifest }
          break
        }
        case 'get_node_full': {
          let maxNodes = 500
          let result: unknown
          const excludeEmptyContainers = (parsed.excludeEmptyContainers as boolean | undefined) ?? true
          const includeOnlyExportable = parsed.includeOnlyExportable as boolean | undefined
          while (true) {
            result = await rpc('get_node', { nodeId: parsed.nodeId, maxNodes, excludeEmptyContainers, includeOnlyExportable }, fileKey)
            if (!(result as { truncated?: boolean }).truncated || maxNodes >= 5000) break
            maxNodes = Math.min(maxNodes * 2, 5000)
          }
          data = result
          break
        }
        case 'get_slice_spec': {
          data = await buildSliceSpec(parsed, fileKey)
          break
        }
        case 'slice_bundle': {
          const nodeId = parsed.nodeId as string
          const outputDir = parsed.outputDir as string
          const scale = (parsed.scale as number | undefined) ?? 2
          const assetsDir = join(outputDir, 'assets')
          const specPath = join(outputDir, 'slice-spec.json')
          const textPath = join(outputDir, 'text-content.json')
          const [summary, spec, assetsRes, text] = await Promise.all([
            rpc('get_frame_summary', { nodeId }, fileKey).catch((e) => ({ error: (e as Error).message })),
            buildSliceSpec({ nodeId, outputDir: assetsDir, outputPath: specPath, omitSvgs: false }, fileKey),
            (async () => {
              const disc = await rpc('get_exportable_nodes', { nodeId }, fileKey) as { exportableNodes: Array<{ nodeId: string; name: string; hasImageFill: boolean }> }
              mkdirSync(assetsDir, { recursive: true })
              const used = new Set<string>()
              let pngCount = 0
              for (const n of disc.exportableNodes.filter(x => x.hasImageFill)) {
                try {
                  const r = await rpc('get_screenshot', { nodeId: n.nodeId, format: 'PNG', scale }, fileKey) as { screenshots: Array<{ data: string }> }
                  const s = r.screenshots[0]
                  if (!s) continue
                  writeFileSync(join(assetsDir, uniqueFileName(n.name, n.nodeId, used, 'png')), Buffer.from(s.data, 'base64'))
                  pngCount++
                } catch {}
              }
              return { pngCount }
            })().catch(() => ({ pngCount: 0 })),
            rpc('get_text_content', { nodeId }, fileKey).catch(() => null),
          ])
          if (text) { mkdirSync(dirname(textPath), { recursive: true }); writeFileSync(textPath, JSON.stringify(text, null, 2), 'utf8') }
          const specSummary = spec as { savedTo?: string; assetRefs?: unknown[] }
          const sum = summary as { hasVariableTokens?: boolean; hasTextStyles?: boolean }
          data = {
            summary,
            specSavedTo: specSummary.savedTo,
            assets: { svgCount: specSummary.assetRefs?.length ?? 0, pngCount: (assetsRes).pngCount, dir: assetsDir },
            text: text ? { savedTo: textPath } : null,
            tokens: { hasVariableTokens: sum.hasVariableTokens ?? false, hasTextStyles: sum.hasTextStyles ?? false },
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
