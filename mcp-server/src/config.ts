export const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3000'
export const MCP_PORT = Number(process.env.MCP_PORT) || 3001
export const MCP_API_KEY = process.env.MCP_API_KEY || ''
export const MCP_PUBLIC_URL = (process.env.MCP_PUBLIC_URL || `http://localhost:${MCP_PORT}`).replace(/\/$/, '')
