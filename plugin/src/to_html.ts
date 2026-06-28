export function nodeToHTML(node: SceneNode): string {
  const tag = figmaTag(node)
  const css = figmaCSS(node)
  const attrs = figmaAttrs(node)
  const attrStr = attrs.map((a) => `${a[0]}="${a[1]}"`).join(' ')
  const styleStr = css.length > 0 ? ` style="${css.join('; ')}"` : ''
  const openTag = attrStr ? `<${tag} ${attrStr}${styleStr}>` : `<${tag}${styleStr}>`
  const closeTag = `</${tag}>`

  if (node.type === 'TEXT') {
    const tn = node as TextNode
    return `${openTag}${escapeHTML(tn.characters)}${closeTag}`
  }

  if ('children' in node && node.children.length > 0) {
    const children = node.children
      .filter((c) => c.visible !== false)
      .map((c) => nodeToHTML(c as SceneNode))
      .join('\n    ')
    return `${openTag}\n    ${children}\n  ${closeTag}`
  }

  return `${openTag}${closeTag}`
}

function figmaTag(node: SceneNode): string {
  switch (node.type) {
    case 'TEXT': return 'span'
    case 'LINE': return 'hr'
    case 'ELLIPSE': return 'div'
    case 'RECTANGLE': return 'div'
    case 'FRAME': return 'div'
    case 'GROUP': return 'div'
    case 'COMPONENT': return 'div'
    case 'INSTANCE': return 'div'
    case 'COMPONENT_SET': return 'div'
    case 'VECTOR': return 'svg'
    case 'BOOLEAN_OPERATION': return 'div'
    case 'SLICE': return 'div'
    case 'SECTION': return 'section'
    default: return 'div'
  }
}

function figmaCSS(node: SceneNode): string[] {
  const css: string[] = []
  const hasPos = 'x' in node
  if (hasPos) {
    css.push(`position: absolute`)
    css.push(`left: ${(node as SceneNode).x}px`)
    css.push(`top: ${(node as SceneNode).y}px`)
    css.push(`width: ${(node as SceneNode).width}px`)
    css.push(`height: ${(node as SceneNode).height}px`)
  }
  if ('opacity' in node && (node as BlendMixin).opacity !== undefined && (node as BlendMixin).opacity < 1) {
    css.push(`opacity: ${(node as BlendMixin).opacity}`)
  }
  if ('rotation' in node && (node as SceneNode).rotation !== 0) {
    css.push(`transform: rotate(${(node as SceneNode).rotation}deg)`)
  }
  if (!node.visible) css.push('display: none')

  // Fills
  if ('fills' in node) {
    const fills = (node as GeometryMixin).fills
    if (fills !== figma.mixed && fills && fills.length > 0) {
      const solid = fills.find((f) => f.type === 'SOLID' && f.visible !== false) as SolidPaint | undefined
      if (solid && solid.color) {
        css.push(`background-color: ${rgbaStr(solid.color, solid.opacity ?? 1)}`)
      }
      const gradient = fills.find((f) => f.type.startsWith('GRADIENT') && f.visible !== false) as GradientPaint | undefined
      if (gradient) {
        css.push(`background: ${gradientCSS(gradient)}`)
      }
    }
  }

  // Strokes / border
  if ('strokes' in node) {
    const strokes = (node as GeometryMixin).strokes
    if (strokes !== figma.mixed && strokes && strokes.length > 0) {
      const solid = strokes.find((f) => f.type === 'SOLID' && f.visible !== false) as SolidPaint | undefined
      if (solid && solid.color) {
        const sw = (node as GeometryMixin).strokeWeight
        const weight = sw !== figma.mixed && typeof sw === 'number' ? sw : 1
        css.push(`border: ${weight}px solid ${rgbaStr(solid.color, solid.opacity ?? 1)}`)
      }
    }
    if ('strokeAlign' in node) {
      const align = (node as GeometryMixin).strokeAlign
      if (align === 'INSIDE') css.push(`box-sizing: border-box`)
    }
  }

  // Corner radius
  if ('cornerRadius' in node) {
    const cr = (node as RectangleCornerMixin).cornerRadius
    if (cr !== figma.mixed && cr !== undefined && cr > 0) {
      css.push(`border-radius: ${cr}px`)
    }
  }

  // Effects
  if ('effects' in node) {
    const effects = (node as BlendMixin).effects
    if (effects !== figma.mixed && effects) {
      const shadows = effects.filter((e) => (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false) as ShadowEffect[]
      for (const s of shadows) {
        const inset = s.type === 'INNER_SHADOW' ? 'inset ' : ''
        css.push(`box-shadow: ${inset}${s.offset.x}px ${s.offset.y}px ${s.radius}px ${s.spread ?? 0}px ${rgbaStr(s.color, s.color.a ?? 1)}`)
      }
    }
  }

  // Auto-layout
  if ('layoutMode' in node) {
    const f = node as FrameNode
    if (f.layoutMode === 'HORIZONTAL') {
      css.push('display: flex')
      css.push('flex-direction: row')
      if (f.itemSpacing > 0) css.push(`gap: ${f.itemSpacing}px`)
      css.push(`align-items: ${flexAlign(f.counterAxisAlignItems)}`)
      css.push(`justify-content: ${flexJustify(f.primaryAxisAlignItems)}`)
    } else if (f.layoutMode === 'VERTICAL') {
      css.push('display: flex')
      css.push('flex-direction: column')
      if (f.itemSpacing > 0) css.push(`gap: ${f.itemSpacing}px`)
      css.push(`align-items: ${flexAlign(f.counterAxisAlignItems)}`)
      css.push(`justify-content: ${flexJustify(f.primaryAxisAlignItems)}`)
    } else if (f.layoutMode === 'GRID') {
      css.push('display: grid')
    }
    if (f.paddingTop > 0 || f.paddingBottom > 0 || f.paddingLeft > 0 || f.paddingRight > 0) {
      css.push(`padding: ${f.paddingTop}px ${f.paddingRight}px ${f.paddingBottom}px ${f.paddingLeft}px`)
    }
    if (f.clipsContent) css.push('overflow: hidden')
    if ('strokesIncludedInLayout' in f && f.strokesIncludedInLayout) css.push('box-sizing: border-box')
  }

  // Text styles
  if (node.type === 'TEXT') {
    const t = node as TextNode
    if (t.fontSize !== figma.mixed) css.push(`font-size: ${t.fontSize}px`)
    if (t.fontName !== figma.mixed) {
      css.push(`font-family: '${t.fontName.family}'`)
      css.push(`font-weight: ${t.fontName.style === 'Bold' ? 700 : t.fontName.style === 'Medium' ? 500 : t.fontName.style === 'SemiBold' ? 600 : 400}`)
    }
    if (t.lineHeight !== figma.mixed) {
      const lh = t.lineHeight
      if (lh && typeof lh === 'object' && 'value' in lh) {
        const v = lh as { unit: string; value: number }
        css.push(`line-height: ${v.unit === 'AUTO' ? 'normal' : v.unit === 'PERCENT' ? `${v.value}%` : `${v.value}px`}`)
      }
    }
    if (t.letterSpacing !== figma.mixed && typeof t.letterSpacing === 'object') {
      const ls = t.letterSpacing as { value: number; unit: string }
      css.push(`letter-spacing: ${ls.value}${ls.unit === 'PERCENT' ? '%' : 'px'}`)
    }
    if (t.textAlignHorizontal !== 'LEFT') css.push(`text-align: ${t.textAlignHorizontal.toLowerCase()}`)
    if (t.textCase !== 'ORIGINAL' && t.textCase !== figma.mixed) {
      css.push(`text-transform: ${(t.textCase as string === 'UPPER') ? 'uppercase' : (t.textCase as string === 'LOWER') ? 'lowercase' : 'capitalize'}`)
    }
    if (t.textDecoration !== 'NONE' && t.textDecoration !== figma.mixed) {
      css.push(`text-decoration: ${(t.textDecoration as string).toLowerCase()}`)
    }
    if (t.textAutoResize === 'HEIGHT') css.push('height: auto')
    if (t.textAutoResize === 'WIDTH_AND_HEIGHT') { css.push('width: auto'); css.push('height: auto') }
    if (t.textAutoResize === 'TRUNCATE') css.push('overflow: hidden; text-overflow: ellipsis; white-space: nowrap')
  }

  return css
}

function figmaAttrs(node: SceneNode): [string, string][] {
  const attrs: [string, string][] = []
  if (node.type !== 'TEXT') {
    attrs.push(['data-figma-id', node.id])
    attrs.push(['data-figma-name', node.name])
    attrs.push(['data-figma-type', node.type])
  }
  return attrs
}

function rgbaStr(color: { r: number; g: number; b: number }, alpha: number): string {
  const r = Math.round(color.r * 255), g = Math.round(color.g * 255), b = Math.round(color.b * 255)
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`
}

function gradientCSS(g: GradientPaint): string {
  const stops = g.gradientStops.map((s) => `${rgbaStr(s.color, s.color.a ?? 1)} ${Math.round(s.position * 100)}%`).join(', ')
  switch (g.type) {
    case 'GRADIENT_LINEAR': return `linear-gradient(${stops})`
    case 'GRADIENT_RADIAL': return `radial-gradient(${stops})`
    case 'GRADIENT_ANGULAR': return `conic-gradient(${stops})`
    case 'GRADIENT_DIAMOND': return `radial-gradient(${stops})`
    default: return `linear-gradient(${stops})`
  }
}

function flexAlign(a: string): string {
  switch (a) {
    case 'MIN': return 'flex-start'
    case 'MAX': return 'flex-end'
    case 'CENTER': return 'center'
    case 'BASELINE': return 'baseline'
    case 'STRETCH': return 'stretch'
    default: return 'flex-start'
  }
}

function flexJustify(a: string): string {
  switch (a) {
    case 'MIN': return 'flex-start'
    case 'MAX': return 'flex-end'
    case 'CENTER': return 'center'
    case 'SPACE_BETWEEN': return 'space-between'
    default: return 'flex-start'
  }
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
