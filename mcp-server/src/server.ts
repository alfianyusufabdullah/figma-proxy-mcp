import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { toolList } from './tools/definitions'
import { registerToolHandler } from './tools/handler'

export function createServer(): Server {
  const srv = new Server(
    { name: 'figma-proxy-mcp', version: '0.2.0' },
    { capabilities: { tools: {} } },
  )
  srv.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList }))
  registerToolHandler(srv)
  return srv
}
