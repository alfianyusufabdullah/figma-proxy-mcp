import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

interface FileEntry {
  filePath: string
  mimeType: string
  expiresAt: number
}

const store = new Map<string, FileEntry>()
const TTL_MS = 10 * 60 * 1000

export function storeFile(data: Buffer | string, mimeType: string): string {
  const ext = mimeType === 'image/svg+xml' ? 'svg' : mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'application/pdf' ? 'pdf' : 'png'
  const id = randomUUID()
  const filePath = join(tmpdir(), `figma-mcp-${id}.${ext}`)
  if (typeof data === 'string') writeFileSync(filePath, data, 'utf8')
  else writeFileSync(filePath, data)
  store.set(id, { filePath, mimeType, expiresAt: Date.now() + TTL_MS })
  return id
}

export function serveFile(id: string): { data: Buffer; mimeType: string } | null {
  const entry = store.get(id)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(id)
    try { unlinkSync(entry.filePath) } catch {}
    return null
  }
  if (!existsSync(entry.filePath)) { store.delete(id); return null }
  return { data: readFileSync(entry.filePath), mimeType: entry.mimeType }
}

setInterval(() => {
  for (const [id, entry] of store) {
    if (Date.now() > entry.expiresAt) {
      store.delete(id)
      try { if (existsSync(entry.filePath)) unlinkSync(entry.filePath) } catch {}
    }
  }
}, 60_000)
