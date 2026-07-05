import { arrayToBase64 } from '../utils'

export async function handleGetScreenshot(params: Record<string, unknown>): Promise<unknown> {
  const nodeIds: string[] = params.nodeIds
    ? (params.nodeIds as string[])
    : params.nodeId
      ? [params.nodeId as string]
      : figma.currentPage.selection.map((n) => n.id)

  const format = (params.format as string) || 'PNG'
  const scale = (params.scale as number) || 2
  const results: Array<{ nodeId: string; data: string; format: string }> = []

  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id)
    if (!node || !('exportAsync' in node)) continue
    try {
      if (format === 'SVG') {
        const svg = await (node as SceneNode).exportAsync({ format: 'SVG_STRING' })
        results.push({ nodeId: id, data: svg, format: 'SVG' })
      } else {
        const fmt = format === 'PDF' ? 'PDF' : 'PNG'
        const bytes = await (node as SceneNode).exportAsync({ format: fmt, constraint: { type: 'SCALE', value: scale } })
        results.push({ nodeId: id, data: arrayToBase64(new Uint8Array(bytes)), format: fmt })
      }
    } catch {}
  }
  return { screenshots: results }
}

async function imageHashOf(node: BaseNode): Promise<string> {
  let imageHash = ''
  if ('fills' in node) {
    const fills = (node as GeometryMixin).fills
    if (fills !== figma.mixed && fills) {
      const imageFill = fills.find((f) => f.type === 'IMAGE')
      if (imageFill) imageHash = imageFill.imageHash ?? ''
    }
  }
  if (!imageHash && 'fillStyleId' in node) {
    const styleId = (node as GeometryMixin).fillStyleId
    if (styleId && styleId !== figma.mixed) {
      const style = await figma.getStyleByIdAsync(styleId)
      if (style && style.type === 'PAINT') {
        const imageFill = style.paints.find((p) => p.type === 'IMAGE')
        if (imageFill) imageHash = imageFill.imageHash ?? ''
      }
    }
  }
  return imageHash
}

export async function handleGetImage(params: Record<string, unknown>): Promise<unknown> {
  const nodeIds: string[] = params.nodeIds
    ? (params.nodeIds as string[])
    : params.nodeId
      ? [params.nodeId as string]
      : figma.currentPage.selection.map((n) => n.id)

  if (nodeIds.length === 0) throw new Error('No nodes specified and nothing is selected')

  const images: Array<{ nodeId: string; data: string; format: string }> = []
  const errors: Array<{ nodeId: string; error: string }> = []

  for (const id of nodeIds) {
    try {
      const node = await figma.getNodeByIdAsync(id)
      if (!node) { errors.push({ nodeId: id, error: 'Node not found' }); continue }
      const imageHash = await imageHashOf(node)
      if (!imageHash) { errors.push({ nodeId: id, error: 'No image fill found on this node' }); continue }
      const image = figma.getImageByHash(imageHash)
      if (!image) { errors.push({ nodeId: id, error: `No image found for hash: ${imageHash}` }); continue }
      const bytes = await image.getBytesAsync()
      images.push({ nodeId: id, data: arrayToBase64(new Uint8Array(bytes)), format: 'PNG' })
    } catch (e) {
      errors.push({ nodeId: id, error: (e as Error).message })
    }
  }
  return { images, errors }
}

export async function handleGetCss(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || !('getCSSAsync' in node)) throw new Error(`Node not found or no CSS: ${nodeId}`)
  return { nodeId, css: await (node as SceneNode).getCSSAsync() }
}

export async function handleGetSvg(params: Record<string, unknown>): Promise<unknown> {
  const nodeIds: string[] = params.nodeIds
    ? (params.nodeIds as string[])
    : params.nodeId
      ? [params.nodeId as string]
      : figma.currentPage.selection.map((n) => n.id)

  if (nodeIds.length === 0) throw new Error('No nodes specified and nothing is selected')

  const results: Array<{ nodeId: string; name: string; type: string; svg: string }> = []
  const errors: Array<{ nodeId: string; error: string }> = []

  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id)
    if (!node) { errors.push({ nodeId: id, error: 'Node not found' }); continue }
    if (!('exportAsync' in node)) { errors.push({ nodeId: id, error: `Node type ${node.type} cannot be exported` }); continue }
    try {
      const svg = await (node as SceneNode).exportAsync({ format: 'SVG_STRING' })
      // annotate INSTANCE exports: Figma may use master component clip-path IDs internally,
      // so agents should trust the node name for file naming rather than internal SVG IDs
      const instanceMeta: Record<string, unknown> = {}
      if (node.type === 'INSTANCE') {
        const mainComp = await (node).getMainComponentAsync()
        instanceMeta.isInstance = true
        instanceMeta.mainComponentId = mainComp?.id ?? null
      }
      results.push({ nodeId: id, name: node.name, type: node.type, svg, ...instanceMeta })
    } catch (e) {
      errors.push({ nodeId: id, error: (e as Error).message })
    }
  }
  return { svgs: results, errors }
}

export async function handleGetExportableNodes(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string | undefined

  type ExportableEntry = {
    nodeId: string; name: string; type: string
    parentId: string | null; parentName: string | null
    exportSettings: ReadonlyArray<ExportSettings>
    width: number; height: number; hasImageFill: boolean
  }
  const results: ExportableEntry[] = []

  const hasImgFill = (n: BaseNode): boolean => {
    if (!('fills' in n)) return false
    const fills = (n as GeometryMixin).fills
    return fills !== figma.mixed && Array.isArray(fills) && fills.some((f: Paint) => f.type === 'IMAGE')
  }

  const walk = (n: BaseNode): void => {
    const es = 'exportSettings' in n ? n.exportSettings : undefined
    const hasEs = Array.isArray(es) && es.length > 0
    const imgFill = hasImgFill(n)
    if ((hasEs || imgFill) && 'width' in n) {
      results.push({
        nodeId: n.id, name: n.name, type: n.type,
        parentId: n.parent?.id ?? null, parentName: n.parent?.name ?? null,
        exportSettings: hasEs && es ? es : [],
        width: n.width, height: n.height,
        hasImageFill: imgFill,
      })
    }
    if ('children' in n) {
      for (const child of (n as ChildrenMixin).children) walk(child)
    }
  }

  if (nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId)
    if (!node) throw new Error(`Node not found: ${nodeId}`)
    walk(node)
  } else {
    for (const child of figma.currentPage.children) walk(child)
  }

  return { exportableNodes: results }
}

export async function handleGetCssBatch(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const root = await figma.getNodeByIdAsync(nodeId)
  if (!root) throw new Error(`Node not found: ${nodeId}`)
  const cssMap: Record<string, Record<string, string>> = {}
  const walk = async (n: BaseNode): Promise<void> => {
    if ('getCSSAsync' in n) {
      try { cssMap[n.id] = await (n as SceneNode).getCSSAsync() } catch {}
    }
    if ('children' in n) {
      for (const child of (n as BaseNode & { children: ReadonlyArray<BaseNode> }).children) await walk(child)
    }
  }
  await walk(root)
  return { cssMap }
}
