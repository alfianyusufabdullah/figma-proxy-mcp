import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { nextRequestId, resolveConnection, sendToPlugin } from './connections'
import { addApiKey } from './apiKeys'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const app = new Hono()

app.use('/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }))

app.get('/health', (c) => c.json({ ok: true }))

app.post('/_internal/apikey', async (c) => {
  const { apiKey } = await c.req.json<{ apiKey?: string }>()
  if (!apiKey) return c.json({ error: 'apiKey required' }, 400)
  addApiKey(apiKey)
  console.log(`API key registered: ${apiKey.slice(0, 8)}...`)
  return c.json({ ok: true })
})

app.get('/rpc', async (c) => {
  const apiKey = c.req.query('apiKey')
  if (!apiKey) return c.json({ error: 'apiKey required' }, 400)

  const command = c.req.query('command')
  if (!command) return c.json({ error: 'command required' }, 400)

  const fileKey = c.req.query('fileKey') || undefined
  const paramsStr = c.req.query('params')
  let params: Record<string, unknown> = {}
  if (paramsStr) {
    try {
      const parsed: unknown = JSON.parse(paramsStr)
      if (!isRecord(parsed)) return c.json({ error: 'invalid params' }, 400)
      params = parsed
    } catch { return c.json({ error: 'invalid params' }, 400) }
  }

  const conn = resolveConnection(apiKey, fileKey)
  if (!conn) return c.json({ error: 'No Figma plugin connected for this apiKey. Run the plugin in Figma first.' }, 503)

  try {
    const data = await sendToPlugin(conn, nextRequestId(), command, params)
    return c.json(data)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 408)
  }
})

interface RpcBody {
  command?: string
  apiKey?: string
  fileKey?: string
  params?: Record<string, unknown>
}

app.post('/rpc', async (c) => {
  const body = await c.req.json<RpcBody>()
  const apiKey = body.apiKey
  if (!apiKey) return c.json({ error: 'apiKey required' }, 400)

  const command = body.command
  if (!command) return c.json({ error: 'command required' }, 400)

  const fileKey = body.fileKey
  const params = body.params || {}

  const conn = resolveConnection(apiKey, fileKey)
  if (!conn) return c.json({ error: 'No Figma plugin connected for this apiKey. Run the plugin in Figma first.' }, 503)

  try {
    const data = await sendToPlugin(conn, nextRequestId(), command, params)
    return c.json(data)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 408)
  }
})
