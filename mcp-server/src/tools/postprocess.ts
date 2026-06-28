interface AnyNode {
  id?: string
  name?: string
  type?: string
  children?: AnyNode[]
  childCount?: number
}

interface WalkResult {
  vectorNodes: Array<{ id: string; name: string; type: string }>
  partialNodes: Array<{ id: string; name: string; childCount: number; returned: number }>
}

const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE'])
const NODE_TOOLS = new Set(['get_document', 'get_node', 'get_design_context', 'get_selection', 'get_node_full', 'get_slice_spec'])
const SCREENSHOT_TOOLS = new Set(['get_screenshot', 'get_image'])

function walkNodes(nodes: AnyNode[], result: WalkResult, visited = 0): number {
  for (const node of nodes) {
    if (visited >= 10_000) break
    visited++

    if (node.type && VECTOR_TYPES.has(node.type) && node.id) {
      result.vectorNodes.push({ id: node.id, name: node.name ?? '', type: node.type })
    }

    const returnedCount = node.children?.length ?? 0
    if (node.childCount !== undefined && node.childCount > returnedCount && node.id) {
      result.partialNodes.push({ id: node.id, name: node.name ?? '', childCount: node.childCount, returned: returnedCount })
    }

    if (node.children && node.children.length > 0) {
      visited = walkNodes(node.children, result, visited)
    }
  }
  return visited
}

function extractRootNodes(d: Record<string, unknown>): AnyNode[] {
  if (Array.isArray(d.nodes)) return d.nodes as AnyNode[]
  if (d.node && typeof d.node === 'object') return [d.node as AnyNode]
  if (Array.isArray(d.selection)) return d.selection as AnyNode[]
  return []
}

function fmt(items: Array<{ id: string; name: string }>, max = 3): string {
  const shown = items.slice(0, max).map(n => `"${n.name}" (${n.id})`)
  const rest = items.length - max
  return shown.join(', ') + (rest > 0 ? ` +${rest} more` : '')
}

function detectPatterns(nodes: AnyNode[]): string[] {
  const hints: string[] = []
  const seen = new Set<string>()

  function check(node: AnyNode, depth: number) {
    if (hints.length >= 5 || depth > 6 || !node.id || seen.has(node.id)) return
    seen.add(node.id)

    const children = node.children ?? []
    const layoutMode = (node as any).styles?.layoutMode as string | undefined
    const nameLower = (node.name ?? '').toLowerCase()

    if (children.length >= 3 && layoutMode) {
      const instances = children.filter(c => c.type === 'INSTANCE')
      if (instances.length >= 3 && instances.length === children.length) {
        const uniqueNames = new Set(instances.map(c => c.name))
        if (uniqueNames.size === 1) {
          hints.push(`REPEATING LIST: "${node.name}" (${node.id}) contains ${instances.length}× "${instances[0].name}". Fetch one instance with get_node to get the component spec, then replicate.`)
        }
      }
    }

    if (nameLower.includes('modal') || nameLower.includes('dialog') || nameLower.includes('bottomsheet') || nameLower.includes('overlay') || nameLower.includes('drawer')) {
      hints.push(`MODAL/OVERLAY: "${node.name}" (${node.id}) — use get_instance_overrides for full variant and state details.`)
    }

    children.forEach(c => check(c, depth + 1))
  }

  nodes.forEach(n => check(n, 0))
  return hints
}

export function postprocess(toolName: string, data: unknown): string {
  const json = JSON.stringify(data, null, 2)

  if (SCREENSHOT_TOOLS.has(toolName)) {
    const d = data as Record<string, unknown>
    const screenshots = (d.screenshots ?? (d.data ? [d] : [])) as Array<{ format?: string }>
    const hasRaster = screenshots.some(s => s.format !== 'SVG')
    if (hasRaster) {
      return json + '\n\n<hint>To save to disk: `echo "<data_value>" | base64 -d > path/to/file.png` via Bash tool — no Python needed. Or re-call with outputPath="..." to have the MCP server write it directly (only works if MCP server shares your filesystem).</hint>'
    }
    return json
  }

  if (toolName === 'get_text_content') {
    const sizeKB = Math.round(json.length / 1024)
    if (sizeKB > 50) {
      const hint = `\n\n<hint>LARGE RESPONSE (~${sizeKB}KB): Scope with nodeId="<frame_id>" to limit to a specific section, or use page="<name>" to limit to one page.</hint>`
      return json + hint
    }
    return json
  }

  if (!NODE_TOOLS.has(toolName)) return json

  const d = data as Record<string, unknown>
  const roots = extractRootNodes(d)
  if (roots.length === 0) return json

  const walked: WalkResult = { vectorNodes: [], partialNodes: [] }
  walkNodes(roots, walked)

  const hints: string[] = []

  if (d.truncated === true) {
    const extra = walked.partialNodes.length > 0
      ? ` Nodes with incomplete children: ${fmt(walked.partialNodes)}.`
      : ''
    hints.push(
      `TRUNCATED: Node tree was cut off at the maxNodes limit.${extra}` +
      ` Re-call with a higher maxNodes (e.g. maxNodes=2000), or use get_node on specific node IDs to fetch individual subtrees fully.`
    )
  } else if (walked.partialNodes.length > 0) {
    hints.push(
      `PARTIAL SUBTREES: ${walked.partialNodes.length} node(s) have more children than returned` +
      ` — ${fmt(walked.partialNodes)}.` +
      ` Use get_node on those IDs to fetch their full subtrees.`
    )
  }

  if (walked.vectorNodes.length > 0) {
    hints.push(
      `VECTOR NODES (${walked.vectorNodes.length}): ${fmt(walked.vectorNodes, 5)}.` +
      ` Use get_svg on these IDs — do not use get_screenshot, which rasterizes them into PNG.`
    )
  }

  const sizeKB = Math.round(json.length / 1024)
  if (sizeKB > 50) {
    hints.push(`LARGE RESPONSE (~${sizeKB}KB): Narrow scope with specific nodeIds, or reduce depth/maxNodes to avoid context bloat.`)
  }

  for (const h of detectPatterns(roots)) hints.push(h)

  if (hints.length === 0) return json

  return `<result>\n${json}\n</result>\n\n<hints>\n${hints.map(h => `- ${h}`).join('\n')}\n</hints>`
}
