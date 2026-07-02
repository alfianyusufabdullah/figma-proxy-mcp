// Pure helpers for slice/asset output shaping.
// Kept framework-free so slice-transforms.test.ts can run under `npx tsx`.

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
