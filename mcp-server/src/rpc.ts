import { PROXY_URL } from './config'

interface RpcErrorBody {
  error?: string
}

function hasErrorField(value: unknown): value is RpcErrorBody {
  return typeof value === 'object' && value !== null && 'error' in value
}

export async function rpc(command: string, params?: Record<string, unknown>, fileKey?: string): Promise<unknown> {
  const body: Record<string, unknown> = { command }
  if (params) body.params = params
  if (fileKey) body.fileKey = fileKey

  const res = await fetch(`${PROXY_URL}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json()
  const errorMessage = hasErrorField(data) ? data.error : undefined
  if (!res.ok || errorMessage) throw new Error(errorMessage || `HTTP ${res.status}`)
  return data
}
