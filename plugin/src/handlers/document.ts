import { serializeNode, resetCount, wasTruncated, toHex } from '../serializer'
import { getFileKey } from '../utils'

export function handleGetDocument(params: Record<string, unknown>): unknown {
  resetCount()
  const page = figma.currentPage
  const depth = (params.depth as number) ?? 3
  const maxNodes = (params.maxNodes as number) ?? 500
  const nodes = page.children
    .filter((c) => c.visible !== false)
    .map((c) => serializeNode(c, { depth, maxNodes }))
  return { pageName: page.name, nodes, truncated: wasTruncated() }
}

export function handleGetSelection(_params: Record<string, unknown>): unknown {
  resetCount()
  const selection = figma.currentPage.selection.map((n) => serializeNode(n, { maxNodes: 100 }))
  return { selection, truncated: wasTruncated() }
}

export async function handleGetNode(params: Record<string, unknown>): Promise<unknown> {
  resetCount()
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const maxNodes = (params.maxNodes as number) ?? 500
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error(`Node not found: ${nodeId}`)
  const serialized = serializeNode(node as SceneNode, {
    maxNodes,
    excludeEmptyContainers: params.excludeEmptyContainers as boolean | undefined,
    includeOnlyExportable: params.includeOnlyExportable as boolean | undefined,
  })
  return { node: serialized, truncated: wasTruncated() }
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

export function handleGetMetadata(_params: Record<string, unknown>): unknown {
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
    nodes: page.children.filter((c) => c.visible !== false).map((c) => serializeNode(c, { depth, maxNodes })),
    truncated: wasTruncated(),
  }
}

const VECTOR_TYPES_SET = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE'])

export async function handleGetFrameSummary(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error(`Node not found: ${nodeId}`)

  const w = 'width' in node ? (node as unknown as Record<string, number>).width : 0
  const h = 'height' in node ? (node as unknown as Record<string, number>).height : 0

  const sections: Array<{ id: string; name: string; type: string; bounds: { y: number; h: number } }> = []
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      if ('visible' in child && !(child).visible) continue
      const bounds = 'y' in child
        ? { y: (child as unknown as Record<string, number>).y, h: (child as unknown as Record<string, number>).height }
        : { y: 0, h: 0 }
      sections.push({ id: child.id, name: child.name, type: child.type, bounds })
    }
  }

  const colors = new Set<string>()
  const fontMap = new Map<string, { family: string; weights: Set<number>; sizes: Set<number> }>()
  let imageCount = 0
  let vectorCount = 0

  const walk = (n: BaseNode): void => {
    if ('fills' in n) {
      const fills = (n as GeometryMixin).fills
      if (fills !== figma.mixed && fills) {
        for (const f of fills) {
          if (f.type === 'SOLID' && f.color) colors.add(toHex(f.color))
          if (f.type === 'IMAGE') imageCount++
        }
      }
    }
    if (n.type === 'TEXT') {
      try {
        const t = n
        if (t.fontName !== figma.mixed) {
          const fn = t.fontName
          if (!fontMap.has(fn.family)) fontMap.set(fn.family, { family: fn.family, weights: new Set(), sizes: new Set() })
          const entry = fontMap.get(fn.family)!
          const w = fn.style === 'Bold' ? 700 : fn.style === 'Medium' ? 500 : fn.style === 'SemiBold' ? 600 : fn.style === 'Light' ? 300 : 400
          entry.weights.add(w)
          if (t.fontSize !== figma.mixed && typeof t.fontSize === 'number') entry.sizes.add(t.fontSize)
        }
      } catch {}
    }
    if (VECTOR_TYPES_SET.has(n.type)) vectorCount++
    if ('children' in n) {
      for (const child of (n as BaseNode & { children: ReadonlyArray<BaseNode> }).children) walk(child)
    }
  }
  walk(node)

  const [varCollections, textStyles] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.getLocalTextStylesAsync(),
  ])

  return {
    nodeId,
    name: node.name,
    dimensions: { width: w, height: h },
    sections,
    colors: [...colors].sort().slice(0, 20),
    fonts: [...fontMap.values()].map((f) => ({
      family: f.family,
      weights: [...f.weights].sort((a, b) => a - b),
      sizes: [...f.sizes].sort((a, b) => a - b),
    })),
    assetCount: { images: imageCount, vectors: vectorCount },
    hasVariableTokens: varCollections.length > 0,
    hasTextStyles: textStyles.length > 0,
  }
}
