import { randomBytes } from 'crypto'

export const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000'
export const MCP_PORT = Number(process.env.MCP_PORT) || 3001
export const MCP_PUBLIC_URL = (process.env.MCP_PUBLIC_URL || `http://localhost:${MCP_PORT}`).replace(/\/$/, '')

async function syncToProxy(key: string): Promise<void> {
  try {
    const res = await fetch(`${PROXY_URL}/_internal/apikey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key }),
    })
    if (!res.ok) console.error(`Failed to sync apiKey to proxy: ${res.status}`)
  } catch {
    console.error('Failed to sync apiKey to proxy — is the WebSocket proxy running?')
  }
}

let _apiKey = process.env.API_KEY || ''
if (!_apiKey) {
  _apiKey = randomBytes(16).toString('hex')
  console.log(`API key auto-generated: ${_apiKey}`)
  void syncToProxy(_apiKey)
} else {
  void syncToProxy(_apiKey)
}

export function getApiKey(): string { return _apiKey }
export function setApiKey(key: string): void { _apiKey = key; console.log(`API key updated: ${_apiKey}`) }
export function generateApiKey(): string {
  const key = randomBytes(16).toString('hex')
  _apiKey = key
  console.log(`API key regenerated: ${_apiKey}`)
  void syncToProxy(key)
  return key
}
