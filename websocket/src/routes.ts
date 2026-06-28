import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { nextRequestId, resolveConnection, sendToPlugin } from './connections'

export const app = new Hono()

app.use('/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }))

app.get('/health', (c) => c.json({ ok: true }))

app.get('/rpc', async (c) => {
  const command = c.req.query('command')
  if (!command) return c.json({ error: 'command required' }, 400)

  const fileKey = c.req.query('fileKey') || undefined
  const paramsStr = c.req.query('params')
  let params: Record<string, unknown> = {}
  if (paramsStr) {
    try { params = JSON.parse(paramsStr) } catch { return c.json({ error: 'invalid params' }, 400) }
  }

  const conn = resolveConnection(fileKey)
  if (!conn) return c.json({ error: 'No Figma plugin connected. Run the plugin in Figma first.' }, 503)

  try {
    const data = await sendToPlugin(conn, nextRequestId(), command, params)
    return c.json(data)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 408)
  }
})

app.post('/rpc', async (c) => {
  const body = await c.req.json()
  const command = body.command as string
  if (!command) return c.json({ error: 'command required' }, 400)

  const fileKey = body.fileKey as string | undefined
  const params = (body.params as Record<string, unknown>) || {}

  const conn = resolveConnection(fileKey)
  if (!conn) return c.json({ error: 'No Figma plugin connected. Run the plugin in Figma first.' }, 503)

  try {
    const data = await sendToPlugin(conn, nextRequestId(), command, params)
    return c.json(data)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 408)
  }
})
