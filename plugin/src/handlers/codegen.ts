import { nodeToHTML } from '../to_html'
import { escapeAttr } from '../utils'

export async function handleExportJson(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || !('exportAsync' in node)) throw new Error('Node does not support export')
  return (node as SceneNode).exportAsync({ format: 'JSON_REST_V1' })
}

const VECTOR_TYPES_HTML = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE'])

export async function handleToHtml(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error('Node not found')

  const includeSvgPaths = (params.includeSvgPaths as boolean) ?? false
  const responsive = (params.responsive as boolean) ?? false
  const assetPaths = params.assetPaths as string | undefined

  const svgMap = new Map<string, string>()
  if (includeSvgPaths) {
    const vectorNodes: SceneNode[] = []
    const collectVectors = (n: BaseNode): void => {
      if (VECTOR_TYPES_HTML.has(n.type) && 'exportAsync' in n) vectorNodes.push(n as SceneNode)
      if ('children' in n) for (const c of (n as BaseNode & { children: ReadonlyArray<BaseNode> }).children) collectVectors(c)
    }
    collectVectors(node)
    await Promise.all(vectorNodes.map(async (vn) => {
      try { svgMap.set(vn.id, await vn.exportAsync({ format: 'SVG_STRING' })) } catch {}
    }))
  }

  const opts = { svgMap: svgMap.size > 0 ? svgMap : undefined, responsive, assetPaths }
  const html = nodeToHTML(node as SceneNode, false, opts, true)
  return { nodeId, html, type: node.type, name: node.name }
}

export async function handleToHtmlPage(params: Record<string, unknown>): Promise<unknown> {
  const pageName = params.page as string | undefined
  const pages = pageName ? figma.root.children.filter((p) => p.name === pageName) : [figma.currentPage]
  const sections: Array<{ pageName: string; html: string }> = []
  for (const p of pages) {
    await p.loadAsync()
    const children = p.children.filter((c) => c.visible !== false).map((c) => nodeToHTML(c)).join('\n    ')
    sections.push({
      pageName: p.name,
      html: `<div data-figma-page="${escapeAttr(p.name)}">\n    ${children}\n  </div>`,
    })
  }
  return {
    html: `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { position: relative; width: 100%; min-height: 100vh; }\n</style></head>\n<body>\n  ${sections.map((s) => s.html).join('\n  ')}\n</body>\n</html>`,
    sections,
  }
}
