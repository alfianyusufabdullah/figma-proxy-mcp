import { PROXY_URL } from './config'

export async function rpc(command: string, params?: Record<string, unknown>, fileKey?: string): Promise<unknown> {
  const body: Record<string, unknown> = { command }
  if (params) body.params = params
  if (fileKey) body.fileKey = fileKey

  const res = await fetch(`${PROXY_URL}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
