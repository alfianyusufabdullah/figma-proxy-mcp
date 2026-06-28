import { nodeToHTML } from '../to_html'
import { escapeAttr } from '../utils'

export async function handleExportJson(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || !('exportAsync' in node)) throw new Error('Node does not support export')
  return (node as SceneNode).exportAsync({ format: 'JSON_REST_V1' })
}

export async function handleToHtml(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error('Node not found')
  const html = nodeToHTML(node as SceneNode)
  return { nodeId, html, type: node.type, name: node.name }
}

export async function handleToHtmlPage(params: Record<string, unknown>): Promise<unknown> {
  const pageName = params.page as string | undefined
  const pages = pageName ? figma.root.children.filter((p) => p.name === pageName) : [figma.currentPage]
  const sections: Array<{ pageName: string; html: string }> = []
  for (const p of pages) {
    await p.loadAsync()
    const children = p.children.filter((c) => c.visible !== false).map((c) => nodeToHTML(c as SceneNode)).join('\n    ')
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
