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
        const bytes = await (node as SceneNode).exportAsync({ format: fmt as 'PNG' | 'PDF', constraint: { type: 'SCALE', value: scale } })
        results.push({ nodeId: id, data: arrayToBase64(new Uint8Array(bytes)), format: fmt })
      }
    } catch (_e) {}
  }
  return { screenshots: results }
}

export async function handleGetImage(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error(`Node not found: ${nodeId}`)

  let imageHash = ''
  if ('fills' in node) {
    const fills = (node as GeometryMixin).fills
    if (fills !== figma.mixed && fills) {
      const imageFill = fills.find((f) => f.type === 'IMAGE') as ImagePaint | undefined
      if (imageFill) imageHash = imageFill.imageHash
    }
  }
  if (!imageHash && 'fillStyleId' in node) {
    const styleId = (node as GeometryMixin).fillStyleId
    if (styleId) {
      const style = await figma.getStyleByIdAsync(styleId)
      if (style && style.type === 'PAINT') {
        const imageFill = (style as PaintStyle).paints.find((p) => p.type === 'IMAGE') as ImagePaint | undefined
        if (imageFill) imageHash = imageFill.imageHash
      }
    }
  }
  if (!imageHash) throw new Error('No image fill found on this node')

  const bytes = await figma.getImageByHash(imageHash).getBytesAsync()
  return { nodeId, data: arrayToBase64(new Uint8Array(bytes)), format: 'PNG' }
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
      results.push({ nodeId: id, name: node.name, type: node.type, svg })
    } catch (e) {
      errors.push({ nodeId: id, error: (e as Error).message })
    }
  }
  return { svgs: results, errors }
}
