import { toHex } from '../serializer'
import { walkAllPages } from '../utils'

export async function handleGetFonts(_params: Record<string, unknown>): Promise<unknown> {
  const fonts = new Set<string>()
  await walkAllPages((node) => {
    if (node.type !== 'TEXT') return
    try {
      const fontName = (node).fontName as FontName
      fonts.add(`${fontName.family} ${fontName.style}`)
    } catch {}
  })
  return { fonts: [...fonts].sort() }
}

export async function handleGetColors(_params: Record<string, unknown>): Promise<unknown> {
  const colors = new Set<string>()
  const processPaints = (paints: ReadonlyArray<Paint> | typeof figma.mixed) => {
    if (paints === figma.mixed || !paints) return
    for (const paint of paints) {
      if (paint.type === 'SOLID' && paint.color) colors.add(toHex(paint.color))
    }
  }
  await walkAllPages((node) => {
    if ('fills' in node) processPaints((node as GeometryMixin).fills)
    if ('strokes' in node) processPaints((node as GeometryMixin).strokes)
  })
  return { colors: [...colors].sort() }
}

export async function handleFindTextNodes(params: Record<string, unknown>): Promise<unknown> {
  const keyword = ((params.keyword as string) || '').toLowerCase()
  const regexStr = params.regex as string | undefined
  const regex = regexStr ? new RegExp(regexStr, 'i') : null
  const results: Array<{ nodeId: string; name: string; text: string; page: string }> = []
  await walkAllPages((node, pageName) => {
    if (node.type !== 'TEXT') return
    try {
      const text = (node).characters
      if (regex && regex.test(text)) results.push({ nodeId: node.id, name: node.name, text, page: pageName })
      else if (keyword && text.toLowerCase().includes(keyword)) results.push({ nodeId: node.id, name: node.name, text, page: pageName })
    } catch {}
  })
  return { results }
}

export async function handleGetTextContent(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string | undefined
  const pageFilter = params.page as string | undefined

  if (nodeId) {
    const root = await figma.getNodeByIdAsync(nodeId)
    if (!root) throw new Error(`Node not found: ${nodeId}`)
    const results: Array<{ nodeId: string; name: string; text: string }> = []
    const walk = (n: BaseNode): void => {
      if (n.type === 'TEXT') {
        try { results.push({ nodeId: n.id, name: n.name, text: (n).characters }) } catch {}
      }
      if ('children' in n) {
        for (const child of (n as BaseNode & { children: ReadonlyArray<BaseNode> }).children) walk(child)
      }
    }
    walk(root)
    return { nodes: results, scopedTo: nodeId }
  }

  const textMap: Record<string, Array<{ nodeId: string; name: string; text: string }>> = {}
  await walkAllPages((node, pageName) => {
    if (node.type !== 'TEXT') return
    try {
      if (!textMap[pageName]) textMap[pageName] = []
      textMap[pageName].push({ nodeId: node.id, name: node.name, text: (node).characters })
    } catch {}
  }, pageFilter)
  return { pages: textMap }
}

export async function handleFindPlaceholders(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string | undefined
  const patterns = [
    { label: 'lorem_ipsum', regex: /lorem\s+ipsum/i },
    { label: 'placeholder', regex: /placeholder/i },
    { label: 'double_braces', regex: /\{\{.+?\}\}/ },
    { label: 'square_brackets', regex: /\[.*?\]/ },
    { label: 'type_something', regex: /type\s+(something|here|text)/i },
    { label: 'your_', regex: /your\s+(text|title|message|name|email|content)/i },
  ]
  const results: Array<{ nodeId: string; name: string; text: string; page: string; matched: string }> = []

  if (nodeId) {
    const root = await figma.getNodeByIdAsync(nodeId)
    if (!root) throw new Error(`Node not found: ${nodeId}`)
    const walk = (n: BaseNode): void => {
      if (n.type === 'TEXT') {
        try {
          const text = (n).characters
          for (const pat of patterns) {
            if (pat.regex.test(text)) {
              results.push({ nodeId: n.id, name: n.name, text, page: 'scoped', matched: pat.label })
              break
            }
          }
        } catch {}
      }
      if ('children' in n) {
        for (const child of (n as BaseNode & { children: ReadonlyArray<BaseNode> }).children) walk(child)
      }
    }
    walk(root)
    return { placeholders: results, scopedTo: nodeId }
  }

  await walkAllPages((node, pageName) => {
    if (node.type !== 'TEXT') return
    try {
      const text = (node).characters
      for (const pat of patterns) {
        if (pat.regex.test(text)) {
          results.push({ nodeId: node.id, name: node.name, text, page: pageName, matched: pat.label })
          break
        }
      }
    } catch {}
  })
  return { placeholders: results }
}
