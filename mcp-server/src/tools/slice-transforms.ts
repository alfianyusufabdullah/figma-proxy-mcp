// Pure helpers for get_slice_spec / slice_bundle output shaping.
// Kept framework-free so slice-transforms.test.ts can run under `npx tsx`.

type AnyRec = Record<string, unknown>

/** Deterministic, collision-safe file name. `used` tracks names already claimed
 *  in this call — a clash appends the sanitized nodeId. Idempotent: same
 *  (name, nodeId) → same file, so re-runs overwrite instead of duplicating. */
export function uniqueFileName(name: string, nodeId: string, used: Set<string>, ext: string, prefix = ''): string {
  const safePrefix = prefix ? prefix.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase().replace(/-+$/, '') + '-' : ''
  const base = (name || 'unnamed').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'unnamed'
  let candidate = `${safePrefix}${base}`
  if (used.has(candidate)) candidate = `${safePrefix}${base}-${nodeId.replace(/:/g, '-')}`
  used.add(candidate)
  return `${candidate}.${ext}`
}

export const svgFileName = (name: string, nodeId: string, used: Set<string>, prefix = ''): string =>
  uniqueFileName(name, nodeId, used, 'svg', prefix)

export function extractViewBox(svg: string): string | undefined {
  return /viewBox="([^"]*)"/.exec(svg)?.[1]
}

const DIMENSION_KEYS = new Set([
  'x', 'y', 'width', 'height', 'itemSpacing', 'counterAxisSpacing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'strokeWeight', 'cornerRadius', 'radius', 'spread',
])

/** round=true → integer for coordinate/dimension keys only (opacity, rotation
 *  left intact). round=false → trim every float to `precision` decimals. */
export function transformNumbers(value: unknown, round: boolean, precision: number, key = ''): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (round) return DIMENSION_KEYS.has(key) ? Math.round(value) : value
    return Number(value.toFixed(precision))
  }
  if (Array.isArray(value)) return value.map(v => transformNumbers(v, round, precision, key))
  if (value && typeof value === 'object') {
    const out: AnyRec = {}
    for (const [k, v] of Object.entries(value as AnyRec)) out[k] = transformNumbers(v, round, precision, k)
    return out
  }
  return value
}

const STYLE_DEFAULTS: AnyRec = {
  opacity: 1, blendMode: 'NORMAL', locked: false, rotation: 0,
  cornerSmoothing: 0, cornerRadius: 0,
  itemSpacing: 0, counterAxisSpacing: 0,
  paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
  layoutWrap: 'NO_WRAP', clipsContent: false,
}

/** Drop provably-default and null style fields so CSS reconstruction is identical. */
function compactOneStyle(styles: AnyRec): AnyRec {
  const out: AnyRec = {}
  for (const [k, v] of Object.entries(styles)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v) && v.length === 0) continue
    if (k in STYLE_DEFAULTS && v === STYLE_DEFAULTS[k]) continue
    out[k] = v
  }
  return out
}

/** Walk tree, apply `fn` to every node's `styles` in place. */
function walkStyles(node: AnyRec, fn: (styles: AnyRec, node: AnyRec) => void): void {
  if (node.styles && typeof node.styles === 'object') fn(node.styles as AnyRec, node)
  if (Array.isArray(node.children)) for (const c of node.children as AnyRec[]) walkStyles(c, fn)
}

/** compact = drop defaults in place. classes = extract styles that appear more
 *  than once into a shared table (returned), nodes reference them via styleRef. */
export function applyStylesFormat(root: AnyRec | undefined, format: 'full' | 'compact' | 'classes'): AnyRec | undefined {
  if (!root || format === 'full') return undefined
  if (format === 'compact') {
    walkStyles(root, (styles, node) => { node.styles = compactOneStyle(styles) })
    return undefined
  }
  const counts = new Map<string, number>()
  walkStyles(root, (styles) => {
    const key = JSON.stringify(styles)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  const styleClasses: AnyRec = {}
  const keyToId = new Map<string, string>()
  let n = 0
  walkStyles(root, (styles, node) => {
    const key = JSON.stringify(styles)
    if ((counts.get(key) ?? 0) < 2) return
    let id = keyToId.get(key)
    if (!id) { id = `s${++n}`; keyToId.set(key, id); styleClasses[id] = styles }
    node.styleRef = id
    delete node.styles
  })
  return styleClasses
}

export function countNodes(node: AnyRec): number {
  let n = 1
  if (Array.isArray(node.children)) for (const c of node.children as AnyRec[]) n += countNodes(c)
  return n
}

export function topSections(root: AnyRec | undefined): Array<{ id: unknown; name: unknown; y?: unknown; h?: unknown }> {
  if (!root || !Array.isArray(root.children)) return []
  return (root.children as AnyRec[]).map(c => {
    const b = (c.bounds ?? c.absoluteBounds) as AnyRec | undefined
    return { id: c.id, name: c.name, y: b?.y, h: b?.height }
  })
}
