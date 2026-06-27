import { serializeNode, resetCount, wasTruncated } from './serializer'
import { nodeToHTML } from './to_html'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function arrayToBase64(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]
    result += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)] +
      (i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=') +
      (i + 2 < bytes.length ? B64[b2 & 63] : '=')
  }
  return result
}

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

let fileKey = ''

function getFileKey(): string {
  if (fileKey) return fileKey
  if (figma.fileKey) {
    fileKey = figma.fileKey
  } else {
    fileKey = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  }
  return fileKey
}

figma.showUI(__html__, { width: 320, height: 200 })

figma.on('selectionchange', () => { try { sendStatus() } catch {} })

function sendStatus() {
  try {
    figma.ui.postMessage({
      type: 'plugin-status',
      payload: strip({ fileKey: getFileKey(), fileName: figma.root.name, selectionCount: figma.currentPage.selection.length }),
    })
  } catch {}
}

const noop = () => {}

async function handleRequest(requestId: string, command: string, params: Record<string, unknown>) {
  try {
    let data: unknown = null
    switch (command) {
      case 'get_document': {
        resetCount()
        const page = figma.currentPage
        const depth = (params.depth as number) ?? 3
        const maxNodes = (params.maxNodes as number) ?? 500
        const nodes = page.children
          .filter((c) => c.visible !== false)
          .map((c) => serializeNode(c as SceneNode, { depth, maxNodes }))
        data = { pageName: page.name, nodes, truncated: wasTruncated() }
        break
      }
      case 'get_selection': {
        resetCount()
        const selection = figma.currentPage.selection.map((n) => serializeNode(n, { maxNodes: 100 }))
        data = { selection }
        break
      }
      case 'get_node': {
        resetCount()
        const nodeId = params.nodeId as string
        if (!nodeId) throw new Error('nodeId is required')
        const node = await figma.getNodeByIdAsync(nodeId)
        if (!node) throw new Error(`Node not found: ${nodeId}`)
        data = serializeNode(node as SceneNode, { maxNodes: 500 })
        break
      }
      case 'get_styles': {
        const [paint, text, effect, grid] = await Promise.all([
          figma.getLocalPaintStylesAsync(),
          figma.getLocalTextStylesAsync(),
          figma.getLocalEffectStylesAsync(),
          figma.getLocalGridStylesAsync(),
        ])
        data = {
          paints: paint.map((s) => ({ id: s.id, name: s.name, key: s.key, type: 'PAINT' })),
          texts: text.map((s) => ({ id: s.id, name: s.name, key: s.key, type: 'TEXT' })),
          effects: effect.map((s) => ({ id: s.id, name: s.name, key: s.key, type: 'EFFECT' })),
          grids: grid.map((s) => ({ id: s.id, name: s.name, key: s.key, type: 'GRID' })),
        }
        break
      }
      case 'get_metadata': {
        data = {
          fileName: figma.root.name,
          currentPage: figma.currentPage.name,
          pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
          fileKey: getFileKey(),
        }
        break
      }
      case 'get_design_context': {
        resetCount()
        const page = figma.currentPage
        const depth = (params.depth as number) ?? 2
        const maxNodes = (params.maxNodes as number) ?? 300
        const targetIds = params.nodeIds as string[] | undefined
        if (targetIds && targetIds.length > 0) {
          const nodes = await Promise.all(targetIds.map((id) => figma.getNodeByIdAsync(id)))
          data = { nodes: nodes.filter(Boolean).map((n) => serializeNode(n as SceneNode, { depth, maxNodes })), truncated: wasTruncated() }
        } else {
          data = { nodes: page.children.filter((c) => c.visible !== false).map((c) => serializeNode(c as SceneNode, { depth, maxNodes })), truncated: wasTruncated() }
        }
        break
      }
      case 'get_variables': {
        const collections = await figma.variables.getLocalVariableCollectionsAsync()
        data = await Promise.all(
          collections.map(async (c) => ({
            id: c.id,
            name: c.name,
            modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
            variables: c.variableIds.map((vId) => ({
              id: vId,
              name: '',
              resolvedType: '',
            })),
          }))
        )
        break
      }
      case 'get_screenshot': {
        const nodeIds = (params.nodeIds || params.nodeId ? [params.nodeId] : figma.currentPage.selection.map((n) => n.id)) as string[]
        const format = (params.format as string) || 'PNG'
        const scale = (params.scale as number) || 2
        const results: Array<{ nodeId: string; data: string; format: string }> = []
        for (const id of nodeIds) {
          const node = await figma.getNodeByIdAsync(id)
          if (!node || !('exportAsync' in node)) continue
          try {
            const fmt = format === 'SVG' ? 'SVG_STRING' : (format === 'PDF' ? 'PDF' : 'PNG') as 'PNG' | 'SVG_STRING' | 'PDF'
            if (fmt === 'SVG_STRING') {
              results.push({ nodeId: id, data: await (node as SceneNode).exportAsync({ format: 'SVG_STRING' }), format: 'SVG' })
            } else {
              const bytes = await (node as SceneNode).exportAsync({ format: fmt as 'PNG' | 'PDF', constraint: { type: 'SCALE', value: scale } })
              results.push({ nodeId: id, data: arrayToBase64(new Uint8Array(bytes)), format })
            }
          } catch { noop() }
        }
        data = { screenshots: results }
        break
      }
      case 'set_text_content': {
        if (figma.editorType === 'dev') throw new Error('Write tools are not available in Dev Mode')
        const nodeId = params.nodeId as string
        const text = params.text as string
        if (!nodeId || text === undefined) throw new Error('nodeId and text are required')
        const textNode = await figma.getNodeByIdAsync(nodeId)
        if (!textNode || textNode.type !== 'TEXT') throw new Error(`Text node not found: ${nodeId}`)
        const tn = textNode as TextNode
        await figma.loadFontAsync(tn.fontName as FontName)
        tn.characters = text
        data = serializeNode(tn, { maxNodes: 100 })
        break
      }
      case 'set_node_visibility': {
        if (figma.editorType === 'dev') throw new Error('Write tools are not available in Dev Mode')
        const ids = params.nodeIds as string[] || (params.nodeId ? [params.nodeId] : [])
        const visible = params.visible as boolean
        if (ids.length === 0 || visible === undefined) throw new Error('nodeIds and visible are required')
        for (const id of ids) {
          const n = await figma.getNodeByIdAsync(id)
          if (n && 'visible' in n) (n as SceneNode).visible = visible
        }
        data = { success: true }
        break
      }
      case 'set_solid_fill': {
        if (figma.editorType === 'dev') throw new Error('Write tools are not available in Dev Mode')
        const fid = params.nodeId as string
        const hex = params.color as string
        if (!fid || !hex) throw new Error('nodeId and color are required')
        const fn = await figma.getNodeByIdAsync(fid)
        if (!fn || !('fills' in fn)) throw new Error(`Node not found or cannot have fills: ${fid}`)
        const c = hexToRGB(hex)
        const fills: Paint[] = [{ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: (params.opacity as number) ?? 1 }]
        try {
          await (fn as GeometryMixin).setFillsAsync(fills)
        } catch {
          (fn as GeometryMixin).fills = fills
        }
        data = { success: true }
        break
      }
      case 'create_text': {
        if (figma.editorType === 'dev') throw new Error('Write tools are not available in Dev Mode')
        const txt = params.text as string || 'Text'
        const tn2 = figma.createText()
        const fallbackFont: FontName = { family: 'Inter', style: 'Regular' }
        await figma.loadFontAsync(fallbackFont)
        tn2.fontName = fallbackFont
        tn2.characters = txt
        if (params.x !== undefined) tn2.x = params.x as number
        if (params.y !== undefined) tn2.y = params.y as number
        if (params.fontSize !== undefined) tn2.fontSize = params.fontSize as number
        const parentId = params.parentId as string | undefined
        if (parentId) {
          const parent = await figma.getNodeByIdAsync(parentId)
          if (parent && 'children' in parent) {
            (parent as FrameNode).appendChild(tn2)
          }
        }
        data = serializeNode(tn2, { maxNodes: 100 })
        break
      }
      case 'get_image': {
        const imgNodeId = params.nodeId as string
        if (!imgNodeId) throw new Error('nodeId is required')
        const imgNode = await figma.getNodeByIdAsync(imgNodeId)
        if (!imgNode) throw new Error(`Node not found: ${imgNodeId}`)
        let imageHash = ''
        if ('fills' in imgNode) {
          const fills = (imgNode as GeometryMixin).fills
          if (fills !== figma.mixed && fills) {
            const imgFill = fills.find((f) => f.type === 'IMAGE') as ImagePaint | undefined
            if (imgFill) imageHash = imgFill.imageHash
          }
        }
        if (!imageHash && 'fillStyleId' in imgNode) {
          const styleId = (imgNode as GeometryMixin).fillStyleId
          if (styleId) {
            const style = await figma.getStyleByIdAsync(styleId)
            if (style && style.type === 'PAINT') {
              const paintStyle = style as PaintStyle
              const paints = paintStyle.paints
              const imgFill = paints.find((p) => p.type === 'IMAGE') as ImagePaint | undefined
              if (imgFill) imageHash = imgFill.imageHash
            }
          }
        }
        if (!imageHash) throw new Error('No image fill found on this node')
        const image = figma.getImageByHash(imageHash)
        const imgBytes = await image.getBytesAsync()
        data = { nodeId: imgNodeId, data: arrayToBase64(new Uint8Array(imgBytes)), format: 'PNG' }
        break
      }
      case 'get_css': {
        const cssNodeId = params.nodeId as string
        if (!cssNodeId) throw new Error('nodeId is required')
        const cssNode = await figma.getNodeByIdAsync(cssNodeId)
        if (!cssNode || !('getCSSAsync' in cssNode)) throw new Error(`Node not found or no CSS: ${cssNodeId}`)
        data = { nodeId: cssNodeId, css: await (cssNode as SceneNode).getCSSAsync() }
        break
      }
      case 'get_fonts': {
        const fonts = new Set<string>()
        function walkFonts(n: BaseNode) {
          if (n.type === 'TEXT') {
            const tn = n as TextNode
            try {
              const fn = tn.fontName as FontName
              fonts.add(`${fn.family} ${fn.style}`)
            } catch {}
          }
          if ('children' in n) {
            for (const c of n.children) walkFonts(c)
          }
        }
        for (const p of figma.root.children) {
          await p.loadAsync()
          walkFonts(p)
        }
        data = { fonts: [...fonts].sort() }
        break
      }
      case 'get_colors': {
        const colors = new Set<string>()
        function walkColors(n: BaseNode) {
          const processPaints = (paints: ReadonlyArray<Paint> | typeof figma.mixed) => {
            if (paints === figma.mixed || !paints) return
            for (const p of paints) {
              if (p.type === 'SOLID' && p.color) {
                const c = p.color
                const r = Math.round(c.r * 255).toString(16).padStart(2, '0')
                const g = Math.round(c.g * 255).toString(16).padStart(2, '0')
                const b = Math.round(c.b * 255).toString(16).padStart(2, '0')
                colors.add(`#${r}${g}${b}`)
              }
            }
          }
          if ('fills' in n) processPaints((n as GeometryMixin).fills)
          if ('strokes' in n) processPaints((n as GeometryMixin).strokes)
          if ('children' in n) {
            for (const c of n.children) walkColors(c as SceneNode)
          }
        }
        for (const p of figma.root.children) {
          await p.loadAsync()
          walkColors(p)
        }
        data = { colors: [...colors].sort() }
        break
      }
      case 'find_text_nodes': {
        const keyword = (params.keyword as string || '').toLowerCase()
        const regexStr = params.regex as string | undefined
        const regex = regexStr ? new RegExp(regexStr, 'i') : null
        const results: Array<{ nodeId: string; name: string; text: string; page: string }> = []
        function walkText(n: BaseNode, pageName: string) {
          if (n.type === 'TEXT') {
            const tn = n as TextNode
            try {
              const txt = tn.characters
              if (regex && regex.test(txt)) results.push({ nodeId: n.id, name: n.name, text: txt, page: pageName })
              else if (keyword && txt.toLowerCase().includes(keyword)) results.push({ nodeId: n.id, name: n.name, text: txt, page: pageName })
            } catch {}
          }
          if ('children' in n) {
            for (const c of n.children) walkText(c as SceneNode, pageName)
          }
        }
        for (const p of figma.root.children) {
          await p.loadAsync()
          walkText(p, p.name)
        }
        data = { results }
        break
      }
      case 'get_text_content': {
        const pageName = params.page as string | undefined
        const targetPages = pageName ? figma.root.children.filter((p) => p.name === pageName) : figma.root.children
        const textMap: Record<string, Array<{ nodeId: string; name: string; text: string }>> = {}
        for (const p of targetPages) {
          await p.loadAsync()
          const items: Array<{ nodeId: string; name: string; text: string }> = []
          function collectText(n: BaseNode) {
            if (n.type === 'TEXT') {
              try { items.push({ nodeId: n.id, name: n.name, text: (n as TextNode).characters }) } catch {}
            }
            if ('children' in n) {
              for (const c of n.children) collectText(c as SceneNode)
            }
          }
          collectText(p)
          textMap[p.name] = items
        }
        data = { pages: textMap }
        break
      }
      case 'get_layout_spec': {
        const lid = params.nodeId as string
        if (!lid) throw new Error('nodeId is required')
        const ln = await figma.getNodeByIdAsync(lid)
        if (!ln) throw new Error('Node not found')
        if (!('layoutMode' in ln)) throw new Error('Node has no auto-layout')
        const f = ln as FrameNode
        data = {
          layoutMode: f.layoutMode,
          itemSpacing: f.itemSpacing,
          counterAxisSpacing: f.counterAxisSpacing,
          padding: { top: f.paddingTop, right: f.paddingRight, bottom: f.paddingBottom, left: f.paddingLeft },
          primaryAxisAlignItems: f.primaryAxisAlignItems,
          counterAxisAlignItems: f.counterAxisAlignItems,
          primaryAxisSizingMode: f.primaryAxisSizingMode,
          counterAxisSizingMode: f.counterAxisSizingMode,
          layoutWrap: f.layoutWrap,
          strokesIncludedInLayout: f.strokesIncludedInLayout,
          counterAxisAlignContent: 'counterAxisAlignContent' in f ? (f as unknown as Record<string, unknown>).counterAxisAlignContent : undefined,
        }
        break
      }
      case 'get_responsive_behavior': {
        const rid = params.nodeId as string
        if (!rid) throw new Error('nodeId is required')
        const rn = await figma.getNodeByIdAsync(rid)
        if (!rn) throw new Error('Node not found')
        data = {
          constraints: 'constraints' in rn ? (rn as ConstraintsMixin).constraints : undefined,
          layoutAlign: 'layoutAlign' in rn ? (rn as SceneNode).layoutAlign : undefined,
          layoutGrow: 'layoutGrow' in rn ? (rn as SceneNode).layoutGrow : undefined,
          layoutPositioning: 'layoutPositioning' in rn ? (rn as SceneNode).layoutPositioning : undefined,
          layoutSizingHorizontal: 'layoutSizingHorizontal' in rn ? (rn as SceneNode).layoutSizingHorizontal : undefined,
          layoutSizingVertical: 'layoutSizingVertical' in rn ? (rn as SceneNode).layoutSizingVertical : undefined,
          minWidth: 'minWidth' in rn ? (rn as SceneNode).minWidth : undefined,
          maxWidth: 'maxWidth' in rn ? (rn as SceneNode).maxWidth : undefined,
          minHeight: 'minHeight' in rn ? (rn as SceneNode).minHeight : undefined,
          maxHeight: 'maxHeight' in rn ? (rn as SceneNode).maxHeight : undefined,
        }
        break
      }
      case 'get_corner_radii': {
        const cid = params.nodeId as string
        if (!cid) throw new Error('nodeId is required')
        const cn = await figma.getNodeByIdAsync(cid)
        if (!cn || !('cornerRadius' in cn)) throw new Error('Node has no corner radius')
        const cm = cn as RectangleCornerMixin
        const tl = cm.topLeftRadius, tr = cm.topRightRadius, bl = cm.bottomLeftRadius, br = cm.bottomRightRadius
        const allSame = tl === tr && tr === bl && bl === br
        data = {
          cornerRadius: allSame ? tl : { topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br },
          cornerSmoothing: cm.cornerSmoothing,
        }
        break
      }
      case 'get_stroke_spec': {
        const sid = params.nodeId as string
        if (!sid) throw new Error('nodeId is required')
        const sn2 = await figma.getNodeByIdAsync(sid)
        if (!sn2 || !('strokes' in sn2)) throw new Error('Node has no strokes')
        const gm = sn2 as GeometryMixin
        const hasComplex = 'strokeTopWeight' in gm
        data = {
          strokes: serializePaints(gm.strokes),
          strokeAlign: gm.strokeAlign,
          strokeWeight: hasComplex ? {
            all: gm.strokeWeight,
            top: (gm as unknown as Record<string, number>).strokeTopWeight,
            bottom: (gm as unknown as Record<string, number>).strokeBottomWeight,
            left: (gm as unknown as Record<string, number>).strokeLeftWeight,
            right: (gm as unknown as Record<string, number>).strokeRightWeight,
          } : gm.strokeWeight,
          dashPattern: 'dashPattern' in gm ? gm.dashPattern : undefined,
          strokeCap: 'strokeCap' in gm ? gm.strokeCap : undefined,
          strokeJoin: 'strokeJoin' in gm ? gm.strokeJoin : undefined,
          strokeMiterLimit: 'strokeMiterLimit' in gm ? gm.strokeMiterLimit : undefined,
          strokeStyleId: gm.strokeStyleId || undefined,
        }
        break
      }
      case 'get_effect_spec': {
        const eid = params.nodeId as string
        if (!eid) throw new Error('nodeId is required')
        const en = await figma.getNodeByIdAsync(eid)
        if (!en || !('effects' in en)) throw new Error('Node has no effects')
        data = { effects: serializeEffects((en as BlendMixin).effects), effectStyleId: (en as BlendMixin).effectStyleId || undefined }
        break
      }
      case 'get_component_properties': {
        const coid = params.nodeId as string
        if (!coid) throw new Error('nodeId is required')
        const con = await figma.getNodeByIdAsync(coid)
        if (!con) throw new Error('Node not found')
        const cp: Record<string, unknown> = {}
        if ('componentPropertyDefinitions' in con) cp.definitions = (con as InstanceNode).componentPropertyDefinitions
        if ('componentProperties' in con) cp.values = (con as InstanceNode).componentProperties
        if ('variantProperties' in con) cp.variantProperties = (con as ComponentNode).variantProperties
        if ('key' in con) cp.key = (con as ComponentNode).key
        if ('remote' in con) cp.remote = (con as ComponentNode).remote
        if ('description' in con) cp.description = (con as ComponentNode).description
        if ('devStatus' in con) cp.devStatus = (con as ComponentNode).devStatus
        data = cp
        break
      }
      case 'get_instance_overrides': {
        const ioid = params.nodeId as string
        if (!ioid) throw new Error('nodeId is required')
        const ion = await figma.getNodeByIdAsync(ioid)
        if (!ion || ion.type !== 'INSTANCE') throw new Error('Node is not an instance')
        const inst = ion as InstanceNode
        const mainComp = await inst.getMainComponentAsync()
        data = {
          overrides: inst.overrides.map((o) => ({ id: o.id, overriddenFields: o.overriddenFields })),
          scaleFactor: inst.scaleFactor,
          isExposedInstance: inst.isExposedInstance,
          exposedInstances: inst.exposedInstances.map((e) => ({ id: e.id, name: e.name })),
          mainComponent: mainComp ? { id: mainComp.id, name: mainComp.name, key: mainComp.key } : null,
        }
        break
      }
      case 'get_variable_tokens': {
        const collections = await figma.variables.getLocalVariableCollectionsAsync()
        const allVars = await figma.variables.getLocalVariablesAsync()
        const varMap = new Map(allVars.map((v) => [v.id, v]))
        data = await Promise.all(
          collections.map(async (c) => ({
            id: c.id,
            name: c.name,
            defaultModeId: c.defaultModeId,
            modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
            variables: c.variableIds.map((vId) => {
              const v = varMap.get(vId)
              if (!v) return { id: vId, name: 'unknown', resolvedType: 'UNKNOWN' }
              const values: Record<string, unknown> = {}
              for (const mode of c.modes) {
                const raw = v.valuesByMode[mode.modeId]
                if (raw && typeof raw === 'object' && 'type' in raw && (raw as { type: string }).type === 'VARIABLE_ALIAS') {
                  values[mode.name] = { type: 'ALIAS', id: (raw as { id: string }).id }
                } else {
                  values[mode.name] = raw
                }
              }
              return {
                id: v.id, name: v.name, key: v.key, resolvedType: v.resolvedType,
                description: v.description, codeSyntax: v.codeSyntax, scopes: v.scopes,
                valuesByMode: values, hiddenFromPublishing: v.hiddenFromPublishing,
              }
            }),
          }))
        )
        break
      }
      case 'get_node_variable_bindings': {
        const bnodeId = params.nodeId as string
        if (!bnodeId) throw new Error('nodeId is required')
        const bnode = await figma.getNodeByIdAsync(bnodeId)
        if (!bnode) throw new Error('Node not found')
        data = {
          boundVariables: ('boundVariables' in bnode) ? (bnode as SceneNode).boundVariables : undefined,
          inferredVariables: ('inferredVariables' in bnode) ? (bnode as SceneNode).inferredVariables : undefined,
          resolvedVariableModes: ('resolvedVariableModes' in bnode) ? (bnode as SceneNode).resolvedVariableModes : undefined,
        }
        break
      }
      case 'export_json': {
        const eoid = params.nodeId as string
        if (!eoid) throw new Error('nodeId is required')
        const eon = await figma.getNodeByIdAsync(eoid)
        if (!eon || !('exportAsync' in eon)) throw new Error('Node does not support export')
        data = await (eon as SceneNode).exportAsync({ format: 'JSON_REST_V1' })
        break
      }
      case 'to_html': {
        const hnodeId = params.nodeId as string
        if (!hnodeId) throw new Error('nodeId is required')
        const hnode = await figma.getNodeByIdAsync(hnodeId)
        if (!hnode) throw new Error('Node not found')
        const html = nodeToHTML(hnode as SceneNode)
        data = { nodeId: hnodeId, html, type: hnode.type, name: hnode.name }
        break
      }
      case 'to_html_page': {
        const htmlPageName = params.page as string | undefined
        const htmlPages = htmlPageName ? figma.root.children.filter((p) => p.name === htmlPageName) : [figma.currentPage]
        const sections: Array<{ pageName: string; html: string }> = []
        for (const p of htmlPages) {
          await p.loadAsync()
          const children = p.children.filter((c) => c.visible !== false).map((c) => nodeToHTML(c as SceneNode)).join('\n    ')
          sections.push({
            pageName: p.name,
            html: `<div data-figma-page="${escapeAttr(p.name)}">\n    ${children}\n  </div>`,
          })
        }
        data = {
          html: `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { position: relative; width: 100%; min-height: 100vh; }\n</style></head>\n<body>\n  ${sections.map((s) => s.html).join('\n  ')}\n</body>\n</html>`,
          sections,
        }
        break
      }
      case 'get_text_segments': {
        const tsid = params.nodeId as string
        if (!tsid) throw new Error('nodeId is required')
        const tsn = await figma.getNodeByIdAsync(tsid)
        if (!tsn || tsn.type !== 'TEXT') throw new Error('Node is not a text node')
        const tn3 = tsn as TextNode
        const fields = (params.fields as string[]) || ['fontName', 'fontSize', 'fills', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration', 'hyperlink']
        data = { segments: tn3.getStyledTextSegments(fields) }
        break
      }
      case 'detect_text_overflow': {
        const pageName2 = params.page as string | undefined
        const targetPages2 = pageName2 ? figma.root.children.filter((p) => p.name === pageName2) : figma.root.children
        const overflowed: Array<{ nodeId: string; name: string; text: string; page: string }> = []
        for (const p of targetPages2) {
          await p.loadAsync()
          const walk2 = (n: BaseNode, pageN: string) => {
            if (n.type === 'TEXT') {
              try {
                const tn4 = n as TextNode
                const parent = tn4.parent
                if (parent && 'clipsContent' in parent && (parent as FrameNode).clipsContent) {
                  const pb = 'absoluteBoundingBox' in tn4 ? tn4.absoluteBoundingBox : null
                  const cb = 'absoluteBoundingBox' in parent ? (parent as FrameNode).absoluteBoundingBox : null
                  if (pb && cb && (pb.x + pb.width > cb.x + cb.width + 1 || pb.y + pb.height > cb.y + cb.height + 1)) {
                    overflowed.push({ nodeId: tn4.id, name: tn4.name, text: tn4.characters, page: pageN })
                  }
                }
              } catch {}
            }
            if ('children' in n) {
              for (const c of n.children) walk2(c as SceneNode, pageN)
            }
          }
          walk2(p, p.name)
        }
        data = { overflowed }
        break
      }
      case 'find_placeholders': {
        const patterns = [
          { label: 'lorem_ipsum', regex: /lorem\s+ipsum/i },
          { label: 'placeholder', regex: /placeholder/i },
          { label: 'double_braces', regex: /\{\{.+?\}\}/ },
          { label: 'square_brackets', regex: /\[.*?\]/ },
          { label: 'type_something', regex: /type\s+(something|here|text)/i },
          { label: 'your_', regex: /your\s+(text|title|message|name|email|content)/i },
        ]
        const results: Array<{ nodeId: string; name: string; text: string; page: string; matched: string }> = []
        for (const p of figma.root.children) {
          await p.loadAsync()
          const walk3 = (n: BaseNode, pageN: string) => {
            if (n.type === 'TEXT') {
              try {
                const txt = (n as TextNode).characters
                for (const pat of patterns) {
                  if (pat.regex.test(txt)) {
                    results.push({ nodeId: n.id, name: n.name, text: txt, page: pageN, matched: pat.label })
                    break
                  }
                }
              } catch {}
            }
            if ('children' in n) {
              for (const c of n.children) walk3(c as SceneNode, pageN)
            }
          }
          walk3(p, p.name)
        }
        data = { placeholders: results }
        break
      }
      case 'check_text_consistency': {
        const groupBy = (params.group_by as string) || 'page'
        const pageFilter = params.page as string | undefined
        const pages4 = pageFilter ? figma.root.children.filter((p) => p.name === pageFilter) : figma.root.children
        const allTextData: Array<{ nodeId: string; name: string; text: string; page: string; fontSize: number | null; fontFamily: string | null; lineHeight: number | null; color: string | null; textCase: string | null }> = []
        for (const p of pages4) {
          await p.loadAsync()
          const walk4 = (n: BaseNode, pageN: string) => {
            if (n.type === 'TEXT') {
              try {
                const tn5 = n as TextNode
                const fontSize = tn5.fontSize !== figma.mixed ? tn5.fontSize : null
                const fn = tn5.fontName !== figma.mixed ? tn5.fontName : null
                const lh = tn5.lineHeight !== figma.mixed ? tn5.lineHeight : null
                const tc = tn5.textCase !== figma.mixed ? tn5.textCase : null
                let color: string | null = null
                const fills = tn5.fills
                if (fills !== figma.mixed && fills && fills.length > 0 && fills[0].type === 'SOLID') {
                  const c = (fills[0] as SolidPaint).color
                  color = `#${Math.round(c.r*255).toString(16).padStart(2,'0')}${Math.round(c.g*255).toString(16).padStart(2,'0')}${Math.round(c.b*255).toString(16).padStart(2,'0')}`
                }
                allTextData.push({
                  nodeId: tn5.id, name: tn5.name, text: tn5.characters, page: pageN,
                  fontSize: fontSize as number | null,
                  fontFamily: fn ? `${fn.family} ${fn.style}` : null,
                  lineHeight: lh && typeof lh === 'object' && 'value' in lh ? (lh as { value: number }).value : null,
                  color, textCase: tc as string | null,
                })
              } catch {}
            }
            if ('children' in n) {
              for (const c of n.children) walk4(c as SceneNode, pageN)
            }
          }
          walk4(p, p.name)
        }
        const grouped: Record<string, typeof allTextData> = {}
        if (groupBy === 'page') {
          for (const item of allTextData) {
            if (!grouped[item.page]) grouped[item.page] = []
            grouped[item.page].push(item)
          }
        } else if (groupBy === 'fontSize') {
          for (const item of allTextData) {
            const key = String(item.fontSize ?? 'mixed')
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(item)
          }
        } else if (groupBy === 'fontFamily') {
          for (const item of allTextData) {
            const key = item.fontFamily ?? 'unknown'
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(item)
          }
        }
        data = { totalNodes: allTextData.length, grouped }
        break
      }
      case 'get_typography_tokens': {
        const textStyles = await figma.getLocalTextStylesAsync()
        data = await Promise.all(
          textStyles.map(async (s) => ({
            id: s.id, name: s.name, key: s.key, description: s.description,
            fontSize: s.fontSize, fontName: s.fontName, fontWeight: s.fontWeight,
            lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
            textCase: s.textCase, textDecoration: s.textDecoration,
            paragraphSpacing: s.paragraphSpacing, paragraphIndent: s.paragraphIndent,
            listSpacing: s.listSpacing, leadingTrim: s.leadingTrim,
          }))
        )
        break
      }
      case 'set_node_properties': {
        if (figma.editorType === 'dev') throw new Error('Write tools are not available in Dev Mode')
        const pid = params.nodeId as string
        if (!pid) throw new Error('nodeId is required')
        const pn = await figma.getNodeByIdAsync(pid)
        if (!pn) throw new Error(`Node not found: ${pid}`)
        const sn = pn as SceneNode
        if (params.name !== undefined) sn.name = params.name as string
        if (params.x !== undefined && 'x' in sn) sn.x = params.x as number
        if (params.y !== undefined && 'y' in sn) sn.y = params.y as number
        if (params.width !== undefined && 'resize' in sn) sn.resize(params.width as number, params.height !== undefined ? params.height as number : sn.width)
        if (params.height !== undefined && 'resize' in sn && params.width === undefined) sn.resize(sn.width, params.height as number)
        if (params.opacity !== undefined && 'opacity' in sn) sn.opacity = params.opacity as number
        data = serializeNode(sn, { maxNodes: 100 })
        break
      }
      default:
        throw new Error(`Unknown command: ${command}`)
    }
    figma.ui.postMessage({ type: 'response', requestId, data: strip(data) })
  } catch (e) {
    figma.ui.postMessage({ type: 'response', requestId, error: (e as Error).message })
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function strip(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj))
}

figma.ui.onmessage = (msg) => {
  if (msg.type === 'ui-ready') {
    try { sendStatus() } catch {}
  }
  if (msg.type === 'request') {
    handleRequest(msg.requestId, msg.command, msg.params || {})
  }
}
