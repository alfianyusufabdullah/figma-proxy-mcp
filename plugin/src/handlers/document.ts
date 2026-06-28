import { serializeNode, resetCount, wasTruncated } from '../serializer'
import { getFileKey } from '../utils'

export async function handleGetDocument(params: Record<string, unknown>): Promise<unknown> {
  resetCount()
  const page = figma.currentPage
  const depth = (params.depth as number) ?? 3
  const maxNodes = (params.maxNodes as number) ?? 500
  const nodes = page.children
    .filter((c) => c.visible !== false)
    .map((c) => serializeNode(c as SceneNode, { depth, maxNodes }))
  return { pageName: page.name, nodes, truncated: wasTruncated() }
}

export async function handleGetSelection(_params: Record<string, unknown>): Promise<unknown> {
  resetCount()
  const selection = figma.currentPage.selection.map((n) => serializeNode(n, { maxNodes: 100 }))
  return { selection }
}

export async function handleGetNode(params: Record<string, unknown>): Promise<unknown> {
  resetCount()
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error(`Node not found: ${nodeId}`)
  return serializeNode(node as SceneNode, { maxNodes: 500 })
}

export async function handleGetStyles(_params: Record<string, unknown>): Promise<unknown> {
  const [paint, text, effect, grid] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
  ])
  return {
    paints: paint.map((s) => ({ id: s.id, name: s.name, key: s.key, type: 'PAINT' })),
    texts: text.map((s) => ({ id: s.id, name: s.name, key: s.key, type: 'TEXT' })),
    effects: effect.map((s) => ({ id: s.id, name: s.name, key: s.key, type: 'EFFECT' })),
    grids: grid.map((s) => ({ id: s.id, name: s.name, key: s.key, type: 'GRID' })),
  }
}

export async function handleGetMetadata(_params: Record<string, unknown>): Promise<unknown> {
  return {
    fileName: figma.root.name,
    currentPage: figma.currentPage.name,
    pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
    fileKey: getFileKey(),
  }
}

export async function handleGetDesignContext(params: Record<string, unknown>): Promise<unknown> {
  resetCount()
  const page = figma.currentPage
  const depth = (params.depth as number) ?? 2
  const maxNodes = (params.maxNodes as number) ?? 300
  const targetIds = params.nodeIds as string[] | undefined
  if (targetIds && targetIds.length > 0) {
    const nodes = await Promise.all(targetIds.map((id) => figma.getNodeByIdAsync(id)))
    return { nodes: nodes.filter(Boolean).map((n) => serializeNode(n as SceneNode, { depth, maxNodes })), truncated: wasTruncated() }
  }
  return {
    nodes: page.children.filter((c) => c.visible !== false).map((c) => serializeNode(c as SceneNode, { depth, maxNodes })),
    truncated: wasTruncated(),
  }
}
