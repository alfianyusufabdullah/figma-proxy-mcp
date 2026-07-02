import { serializeNode } from '../serializer'
import { hexToRGB } from '../utils'

function assertEditor() {
  if (figma.editorType === 'dev') throw new Error('Write tools are not available in Dev Mode')
}

async function loadAllFonts(tn: TextNode): Promise<void> {
  if (tn.fontName !== figma.mixed) {
    await figma.loadFontAsync(tn.fontName)
    return
  }
  const len = tn.characters.length
  if (len === 0) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    return
  }
  const seen = new Map<string, FontName>()
  for (let i = 0; i < len; i++) {
    const fn = tn.getRangeFontName(i, i + 1) as FontName
    const key = `${fn.family}::${fn.style}`
    if (!seen.has(key)) seen.set(key, fn)
  }
  await Promise.all([...seen.values()].map(fn => figma.loadFontAsync(fn)))
}

export async function handleSetTextContent(params: Record<string, unknown>): Promise<unknown> {
  assertEditor()
  const nodeId = params.nodeId as string
  const text = params.text as string
  if (!nodeId || text === undefined) throw new Error('nodeId and text are required')

  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error(`Node not found: ${nodeId}`)

  if (node.type !== 'TEXT') {
    if ('children' in node) {
      const textChildren = (node as ChildrenMixin).findAll(n => n.type === 'TEXT') as TextNode[]
      if (textChildren.length > 0) {
        const preview = textChildren.slice(0, 5)
          .map(n => `"${n.name}" (${n.id})${n.characters ? ': "' + n.characters.slice(0, 30) + '"' : ''}`)
          .join(', ')
        throw new Error(
          `Node ${nodeId} is ${node.type}, not TEXT. ` +
          `Found ${textChildren.length} text node(s) inside: ${preview}. ` +
          `Call set_text_content with one of those IDs.`
        )
      }
    }
    throw new Error(`Node ${nodeId} is ${node.type}, not TEXT. Use find_text_nodes to locate text nodes.`)
  }

  const tn = node
  await loadAllFonts(tn)
  tn.characters = text
  return serializeNode(tn, { maxNodes: 100 })
}

export async function handleSetNodeVisibility(params: Record<string, unknown>): Promise<unknown> {
  assertEditor()
  const ids = params.nodeIds as string[] || (params.nodeId ? [params.nodeId] : [])
  const visible = params.visible as boolean
  if (ids.length === 0 || visible === undefined) throw new Error('nodeIds and visible are required')
  for (const id of ids) {
    const n = await figma.getNodeByIdAsync(id)
    if (n && 'visible' in n) (n).visible = visible
  }
  return { success: true }
}

export async function handleSetSolidFill(params: Record<string, unknown>): Promise<unknown> {
  assertEditor()
  const nodeId = params.nodeId as string
  const hex = params.color as string
  if (!nodeId || !hex) throw new Error('nodeId and color are required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || !('fills' in node)) throw new Error(`Node not found or cannot have fills: ${nodeId}`)
  const c = hexToRGB(hex)
  const fills: Paint[] = [{ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: (params.opacity as number) ?? 1 }]
  try {
    await (node as GeometryMixin).setFillsAsync(fills)
  } catch {
    (node as GeometryMixin).fills = fills
  }
  return { success: true }
}

export async function handleCreateText(params: Record<string, unknown>): Promise<unknown> {
  assertEditor()
  const txt = params.text as string || 'Text'
  const tn = figma.createText()
  const fallbackFont: FontName = { family: 'Inter', style: 'Regular' }
  await figma.loadFontAsync(fallbackFont)
  tn.fontName = fallbackFont
  tn.characters = txt
  if (params.x !== undefined) tn.x = params.x as number
  if (params.y !== undefined) tn.y = params.y as number
  if (params.fontSize !== undefined) tn.fontSize = params.fontSize as number
  const parentId = params.parentId as string | undefined
  if (parentId) {
    const parent = await figma.getNodeByIdAsync(parentId)
    if (parent && 'children' in parent) {
      (parent as FrameNode).appendChild(tn)
    }
  }
  return serializeNode(tn, { maxNodes: 100 })
}

export async function handleSetNodeProperties(params: Record<string, unknown>): Promise<unknown> {
  assertEditor()
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error(`Node not found: ${nodeId}`)
  const sn = node as SceneNode
  if (params.name !== undefined) sn.name = params.name as string
  if (params.x !== undefined && 'x' in sn) sn.x = params.x as number
  if (params.y !== undefined && 'y' in sn) sn.y = params.y as number
  if (params.width !== undefined && 'resize' in sn) sn.resize(params.width as number, params.height !== undefined ? params.height as number : sn.height)
  if (params.height !== undefined && 'resize' in sn && params.width === undefined) sn.resize(sn.width, params.height as number)
  if (params.opacity !== undefined && 'opacity' in sn) sn.opacity = params.opacity as number
  return serializeNode(sn, { maxNodes: 100 })
}
