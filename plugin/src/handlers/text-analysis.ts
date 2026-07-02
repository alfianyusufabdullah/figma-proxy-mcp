import { walkAllPages } from '../utils'

export async function handleGetTextSegments(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || node.type !== 'TEXT') throw new Error('Node is not a text node')
  type SegmentField = keyof Omit<StyledTextSegment, 'characters' | 'start' | 'end'>
  const defaultFields: SegmentField[] = ['fontName', 'fontSize', 'fills', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration', 'hyperlink']
  const fields = (params.fields as SegmentField[] | undefined) || defaultFields
  return { segments: node.getStyledTextSegments(fields) }
}

export async function handleDetectTextOverflow(params: Record<string, unknown>): Promise<unknown> {
  const overflowed: Array<{ nodeId: string; name: string; text: string; page: string }> = []
  await walkAllPages((node, pageName) => {
    if (node.type !== 'TEXT') return
    try {
      const textNode = node
      const parent = textNode.parent
      if (!parent || !('clipsContent' in parent) || !(parent as FrameNode).clipsContent) return
      const textBounds = 'absoluteBoundingBox' in textNode ? textNode.absoluteBoundingBox : null
      const parentBounds = 'absoluteBoundingBox' in parent ? (parent as FrameNode).absoluteBoundingBox : null
      if (textBounds && parentBounds && (
        textBounds.x + textBounds.width > parentBounds.x + parentBounds.width + 1 ||
        textBounds.y + textBounds.height > parentBounds.y + parentBounds.height + 1
      )) {
        overflowed.push({ nodeId: textNode.id, name: textNode.name, text: textNode.characters, page: pageName })
      }
    } catch {}
  }, params.page as string | undefined)
  return { overflowed }
}

interface TextNodeData {
  nodeId: string
  name: string
  text: string
  page: string
  fontSize: number | null
  fontFamily: string | null
  lineHeight: number | null
  color: string | null
  textCase: string | null
}

export async function handleCheckTextConsistency(params: Record<string, unknown>): Promise<unknown> {
  const groupBy = (params.group_by as string) || 'page'
  const allTextData: TextNodeData[] = []

  await walkAllPages((node, pageName) => {
    if (node.type !== 'TEXT') return
    try {
      const textNode = node
      const fontSize = textNode.fontSize !== figma.mixed ? (textNode.fontSize) : null
      const fontName = textNode.fontName !== figma.mixed ? (textNode.fontName) : null
      const lineHeightRaw = textNode.lineHeight !== figma.mixed ? textNode.lineHeight : null
      const textCase = textNode.textCase !== figma.mixed ? (textNode.textCase as string) : null
      let color: string | null = null
      const fills = textNode.fills
      if (fills !== figma.mixed && fills && fills.length > 0 && fills[0].type === 'SOLID') {
        const c = (fills[0]).color
        color = `#${Math.round(c.r*255).toString(16).padStart(2,'0')}${Math.round(c.g*255).toString(16).padStart(2,'0')}${Math.round(c.b*255).toString(16).padStart(2,'0')}`
      }
      allTextData.push({
        nodeId: textNode.id, name: textNode.name, text: textNode.characters, page: pageName,
        fontSize,
        fontFamily: fontName ? `${fontName.family} ${fontName.style}` : null,
        lineHeight: lineHeightRaw && typeof lineHeightRaw === 'object' && 'value' in lineHeightRaw ? (lineHeightRaw as { value: number }).value : null,
        color, textCase,
      })
    } catch {}
  }, params.page as string | undefined)

  const grouped: Record<string, TextNodeData[]> = {}
  for (const item of allTextData) {
    const key = groupBy === 'fontSize' ? String(item.fontSize ?? 'mixed')
      : groupBy === 'fontFamily' ? (item.fontFamily ?? 'unknown')
      : item.page
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(item)
  }
  return { totalNodes: allTextData.length, grouped }
}

export async function handleGetTypographyTokens(_params: Record<string, unknown>): Promise<unknown> {
  const textStyles = await figma.getLocalTextStylesAsync()
  if (textStyles.length === 0) {
    return { hasStyles: false, reason: 'No local text styles defined in this file', styles: [] }
  }
  const styles = textStyles.map((s) => ({
    id: s.id, name: s.name, key: s.key, description: s.description,
    fontSize: s.fontSize, fontName: s.fontName,
    lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
    textCase: s.textCase, textDecoration: s.textDecoration,
    paragraphSpacing: s.paragraphSpacing, paragraphIndent: s.paragraphIndent,
    listSpacing: s.listSpacing, leadingTrim: s.leadingTrim,
  }))
  return { hasStyles: true, styles }
}
