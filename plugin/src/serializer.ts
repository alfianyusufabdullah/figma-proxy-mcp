export interface SerializeOptions {
  depth?: number
  maxNodes?: number
  excludeVectorPaths?: boolean
}

const VECTOR_LEAF_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE'])

export interface SerializedNode {
  id: string
  name: string
  type: string
  visible: boolean
  bounds?: { x: number; y: number; width: number; height: number }
  absoluteBounds?: { x: number; y: number; width: number; height: number }
  exportSettings?: Array<{ format: string; suffix: string; constraint?: unknown }>
  styles?: Record<string, unknown>
  characters?: string
  children?: SerializedNode[]
  childCount?: number
}

let nodeCount = 0
let didTruncate = false

export function resetCount() { nodeCount = 0; didTruncate = false }
export function wasTruncated(): boolean { return didTruncate }

export function serializeNode(node: SceneNode, opts?: SerializeOptions): SerializedNode {
  const data: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
  }

  if (opts?.excludeVectorPaths && VECTOR_LEAF_TYPES.has(node.type)) {
    if ('x' in node) data.bounds = { x: node.x, y: node.y, width: node.width, height: node.height }
    return data
  }

  if ('x' in node) data.bounds = { x: node.x, y: node.y, width: node.width, height: node.height }

  const ab = (node as any).absoluteBoundingBox as { x: number; y: number; width: number; height: number } | null
  if (ab) data.absoluteBounds = { x: ab.x, y: ab.y, width: ab.width, height: ab.height }

  const exportSettings = (node as any).exportSettings as Array<{ format: string; suffix: string; constraint?: unknown }> | undefined
  if (Array.isArray(exportSettings) && exportSettings.length > 0) {
    data.exportSettings = exportSettings.map(s => ({ format: s.format, suffix: s.suffix, ...(s.constraint ? { constraint: s.constraint } : {}) }))
  }

  const styles: Record<string, unknown> = {}
  if ('opacity' in node) styles.opacity = node.opacity
  if ('blendMode' in node) styles.blendMode = (node as BlendMixin).blendMode
  if ('locked' in node) styles.locked = node.locked
  if ('rotation' in node) styles.rotation = node.rotation

  if ('fills' in node) {
    styles.fills = serializePaints((node as GeometryMixin).fills)
  }
  if ('strokes' in node) {
    styles.strokes = serializePaints((node as GeometryMixin).strokes)
    styles.strokeWeight = (node as GeometryMixin).strokeWeight
    styles.strokeAlign = (node as GeometryMixin).strokeAlign
    if ('dashPattern' in (node as GeometryMixin)) {
      styles.dashPattern = (node as GeometryMixin).dashPattern
    }
  }
  if ('effects' in node) {
    styles.effects = serializeEffects((node as BlendMixin).effects)
  }
  if ('cornerRadius' in node) styles.cornerRadius = (node as RectangleCornerMixin).cornerRadius
  if ('cornerSmoothing' in node) styles.cornerSmoothing = (node as RectangleCornerMixin).cornerSmoothing

  if ('layoutMode' in node) {
    const f = node as FrameNode
    styles.layoutMode = f.layoutMode
    styles.itemSpacing = f.itemSpacing
    styles.counterAxisSpacing = f.counterAxisSpacing
    styles.paddingTop = f.paddingTop
    styles.paddingRight = f.paddingRight
    styles.paddingBottom = f.paddingBottom
    styles.paddingLeft = f.paddingLeft
    styles.primaryAxisAlignItems = f.primaryAxisAlignItems
    styles.counterAxisAlignItems = f.counterAxisAlignItems
    styles.primaryAxisSizingMode = f.primaryAxisSizingMode
    styles.counterAxisSizingMode = f.counterAxisSizingMode
    styles.layoutWrap = f.layoutWrap
  }

  if ('clipsContent' in node) styles.clipsContent = (node as FrameNode).clipsContent
  if ('constraints' in node) styles.constraints = (node as ConstraintsMixin).constraints

  if ('characters' in node) {
    const t = node as TextNode
    data.characters = t.characters
    styles.fontSize = t.fontSize
    styles.fontName = t.fontName
    styles.textAlignHorizontal = t.textAlignHorizontal
    styles.textAlignVertical = t.textAlignVertical
    styles.textAutoResize = t.textAutoResize
    styles.lineHeight = t.lineHeight
    styles.letterSpacing = t.letterSpacing
    styles.textDecoration = t.textDecoration
  }

  if (Object.keys(styles).length > 0) data.styles = styles

  const maxNodes = opts?.maxNodes ?? 2000
  const depth = opts?.depth ?? -1

  if ('children' in node && node.children.length > 0) {
    if (depth === 0) {
      data.childCount = node.children.length
    } else {
      const visible = node.children.filter((c) => c.visible !== false)
      const limited: SceneNode[] = []
      for (const c of visible) {
        if (nodeCount >= maxNodes) {
          didTruncate = true
          break
        }
        limited.push(c as SceneNode)
      }
      data.children = limited.map((c) => {
        nodeCount++
        return serializeNode(c, { maxNodes, depth: depth > 0 ? depth - 1 : -1 })
      })
      if (limited.length < visible.length) {
        data.childCount = visible.length
      }
    }
  }

  return data
}

export function serializePaints(paints: ReadonlyArray<Paint> | typeof figma.mixed): unknown[] | undefined {
  if (paints === figma.mixed || !paints) return undefined
  return paints
    .filter((p) => p.visible !== false)
    .map((p) => {
      const base: Record<string, unknown> = { type: p.type, opacity: p.opacity, blendMode: p.blendMode }
      if (p.type === 'SOLID' && p.color) {
        base.color = toHex(p.color)
      }
      if (p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_ANGULAR' || p.type === 'GRADIENT_DIAMOND') {
        base.gradientType = p.type
        base.gradientTransform = (p as GradientPaint).gradientTransform
        base.gradientStops = (p as GradientPaint).gradientStops.map((s) => ({
          position: s.position,
          color: toHex(s.color),
          opacity: s.color.a ?? 1,
        }))
      }
      if (p.type === 'IMAGE') {
        base.imageHash = (p as ImagePaint).imageHash
        base.scaleMode = (p as ImagePaint).scaleMode
      }
      return base
    })
}

export function serializeEffects(effects: ReadonlyArray<Effect> | typeof figma.mixed): unknown[] | undefined {
  if (effects === figma.mixed || !effects) return undefined
  return effects
    .filter((e) => e.visible !== false)
    .map((e) => {
      const base: Record<string, unknown> = { type: e.type, visible: e.visible }
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        const s = e as ShadowEffect
        base.color = toHex(s.color)
        base.opacity = s.color.a ?? 1
        base.offset = { x: s.offset.x, y: s.offset.y }
        base.radius = s.radius
        base.spread = s.spread
        base.blendMode = s.blendMode
      }
      if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
        base.radius = (e as BlurEffect).radius
      }
      return base
    })
}

export function toHex(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0')
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0')
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}
