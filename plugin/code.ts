import { serializeNode } from './serializer'

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

let fileKey: string = ''

async function getFileKey(): Promise<string> {
  if (fileKey) return fileKey
  if (figma.fileKey) {
    fileKey = figma.fileKey
  } else {
    const stored = await figma.clientStorage.getAsync('mcp_fileKey')
    if (stored) {
      fileKey = stored as string
    } else {
      fileKey = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await figma.clientStorage.setAsync('mcp_fileKey', fileKey)
    }
  }
  return fileKey
}

figma.showUI(__html__, { width: 320, height: 200 })

figma.on('documentchange', () => sendStatus())

async function sendStatus() {
  const key = await getFileKey()
  figma.ui.postMessage({
    type: 'plugin-status',
    payload: { fileKey: key, fileName: figma.root.name, selectionCount: figma.currentPage.selection.length },
  })
}

const noop = () => {}

async function handleRequest(requestId: string, command: string, params: Record<string, unknown>) {
  try {
    let data: unknown = null
    switch (command) {
      case 'get_document': {
        const page = figma.currentPage
        const depth = (params.depth as number) ?? -1
        const nodes = page.children
          .filter((c) => c.visible !== false)
          .map((c) => serializeNode(c as SceneNode, depth))
        data = { pageName: page.name, nodes }
        break
      }
      case 'get_selection': {
        const selection = figma.currentPage.selection.map((n) => serializeNode(n))
        data = { selection }
        break
      }
      case 'get_node': {
        const nodeId = params.nodeId as string
        if (!nodeId) throw new Error('nodeId is required')
        const node = await figma.getNodeByIdAsync(nodeId)
        if (!node) throw new Error(`Node not found: ${nodeId}`)
        data = serializeNode(node as SceneNode)
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
          fileKey: await getFileKey(),
        }
        break
      }
      case 'get_design_context': {
        const page = figma.currentPage
        const depth = (params.depth as number) ?? 2
        const targetIds = params.nodeIds as string[] | undefined
        if (targetIds && targetIds.length > 0) {
          const nodes = await Promise.all(targetIds.map((id) => figma.getNodeByIdAsync(id)))
          data = nodes
            .filter(Boolean)
            .map((n) => serializeNode(n as SceneNode, depth))
        } else {
          data = page.children
            .filter((c) => c.visible !== false)
            .map((c) => serializeNode(c as SceneNode, depth))
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
      default:
        throw new Error(`Unknown command: ${command}`)
    }
    figma.ui.postMessage({ type: 'response', requestId, data })
  } catch (e) {
    figma.ui.postMessage({ type: 'response', requestId, error: (e as Error).message })
  }
}

figma.ui.onmessage = (msg) => {
  if (msg.type === 'ui-ready') {
    sendStatus()
  }
  if (msg.type === 'request') {
    handleRequest(msg.requestId, msg.command, msg.params || {})
  }
}
