type SerializedNode = Record<string, unknown>

function serializeNode(node: SceneNode): SerializedNode {
  const data: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
  }

  if ('opacity' in node) data.opacity = node.opacity
  if ('locked' in node) data.locked = node.locked
  if ('rotation' in node) data.rotation = node.rotation
  if ('absoluteBoundingBox' in node) data.boundingBox = node.absoluteBoundingBox
  if ('fills' in node) data.fills = (node as GeometryMixin).fills
  if ('strokes' in node) data.strokes = (node as GeometryMixin).strokes
  if ('effects' in node) data.effects = (node as BlendMixin).effects
  if ('characters' in node) data.characters = (node as TextNode).characters
  if ('fontName' in node) data.fontName = (node as TextNode).fontName
  if ('fontSize' in node) data.fontSize = (node as TextNode).fontSize

  if ('layoutMode' in node) {
    data.layoutMode = (node as FrameNode).layoutMode
    data.layoutAlign = (node as FrameNode).layoutAlign
    data.layoutGrow = (node as FrameNode).layoutGrow
    data.itemSpacing = (node as FrameNode).itemSpacing
    data.primaryAxisSizingMode = (node as FrameNode).primaryAxisSizingMode
    data.counterAxisSizingMode = (node as FrameNode).counterAxisSizingMode
    data.paddingTop = (node as FrameNode).paddingTop
    data.paddingRight = (node as FrameNode).paddingRight
    data.paddingBottom = (node as FrameNode).paddingBottom
    data.paddingLeft = (node as FrameNode).paddingLeft
  }

  if ('componentPropertyDefinitions' in node) {
    data.componentPropertyDefinitions = (node as InstanceNode).componentPropertyDefinitions
  }
  if ('variantProperties' in node) {
    data.variantProperties = (node as ComponentNode).variantProperties
  }

  if ('children' in node && node.children.length > 0) {
    data.children = node.children.map(serializeNode)
  }

  return data
}

async function collectCurrentPage() {
  const page = figma.currentPage
  const selection = page.selection.map(serializeNode)

  const nodes: SerializedNode[] = []
  for (const child of page.children) {
    nodes.push(serializeNode(child))
  }

  const paintStyles = await figma.getLocalPaintStylesAsync()
  const textStyles = await figma.getLocalTextStylesAsync()
  const effectStyles = await figma.getLocalEffectStylesAsync()
  const gridStyles = await figma.getLocalGridStylesAsync()

  const styles = [
    ...paintStyles.map((s) => ({ type: 'PAINT', name: s.name, key: s.key, id: s.id })),
    ...textStyles.map((s) => ({ type: 'TEXT', name: s.name, key: s.key, id: s.id })),
    ...effectStyles.map((s) => ({ type: 'EFFECT', name: s.name, key: s.key, id: s.id })),
    ...gridStyles.map((s) => ({ type: 'GRID', name: s.name, key: s.key, id: s.id })),
  ]

  return { nodes, styles, variables: [], selection }
}

async function exportNodeAsAsset(nodeId: string) {
  try {
    const node = await figma.getNodeByIdAsync(nodeId)
    if (!node || !('exportAsync' in node)) return null

    const bytes = await (node as SceneNode).exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 },
    })

    const svg = await (node as SceneNode).exportAsync({ format: 'SVG_STRING' })

    return {
      pngBytes: Array.from(bytes),
      svg,
    }
  } catch (_e) {
    return null
  }
}

function strip(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj))
}

figma.showUI(__html__, { width: 320, height: 220 })

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'collect') {
    const data = await collectCurrentPage()
    figma.ui.postMessage({ type: 'snapshot', payload: strip(data) })
  }

  if (msg.type === 'export') {
    const result = await exportNodeAsAsset(msg.nodeId)
    figma.ui.postMessage({ type: 'asset', payload: Object.assign({ nodeId: msg.nodeId }, result) })
  }
}

