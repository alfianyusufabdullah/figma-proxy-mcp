const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function arrayToBase64(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]
    result += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)] +
      (i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=') +
      (i + 2 < bytes.length ? B64[b2 & 63] : '=')
  }
  return result
}

export function hexToRGB(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

export function strip(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj))
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

let cachedFileKey = ''

export function getFileKey(): string {
  if (cachedFileKey) return cachedFileKey
  if (figma.fileKey) {
    cachedFileKey = figma.fileKey
  } else {
    cachedFileKey = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  }
  return cachedFileKey
}

type NodeVisitor = (node: BaseNode, pageName: string) => void

function walkNode(node: BaseNode, pageName: string, visitor: NodeVisitor): void {
  visitor(node, pageName)
  if ('children' in node) {
    for (const child of (node as BaseNode & { children: ReadonlyArray<BaseNode> }).children) {
      walkNode(child, pageName, visitor)
    }
  }
}

export async function walkAllPages(visitor: NodeVisitor, pageFilter?: string): Promise<void> {
  const pages = pageFilter
    ? figma.root.children.filter((p) => p.name === pageFilter)
    : figma.root.children
  for (const p of pages) {
    await p.loadAsync()
    walkNode(p, p.name, visitor)
  }
}
