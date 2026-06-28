interface CacheEntry {
  data: unknown
  expiresAt: number
}

const store = new Map<string, CacheEntry>()

export function cacheGet(key: string): unknown | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.data
}

export function cacheSet(key: string, data: unknown, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs })
}

export function cacheInvalidate(fileKey: string): void {
  const prefix = `${fileKey}:`
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}
