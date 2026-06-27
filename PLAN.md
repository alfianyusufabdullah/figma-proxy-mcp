# PLAN.md — figma-proxy-mcp

## Goal

Build a custom MCP server that proxies Figma document data via a locally-running Figma plugin — bypassing Figma REST API rate limits entirely.

## Phases

### Phase 1: Project Scaffold

- [ ] Create directory structure: `plugin/`, `websocket/`, `mcp-server/`
- [ ] Init `package.json` for each component
- [ ] Install dependencies:
  - `websocket`: `hono`, `ws`, `tsx`
  - `mcp-server`: `@modelcontextprotocol/sdk`, `zod`
  - `plugin`: N/A (browser-side only, bundled by Figma)
- [ ] Create root `tsconfig.json` with shared settings
- [ ] Configure `esbuild` for Figma plugin build (target: es2020, bundle, minify)

### Phase 2: Figma Plugin

- [ ] **`plugin/manifest.json`** — name, api v1.0.0, documentAccess, networkAccess (localhost)
- [ ] **`plugin/code.ts`** (sandbox):
  - `figma.showUI(__html__, { visible: false })` on start
  - Listen for `collect` messages from UI iframe
  - Traverse `figma.currentPage` → serialize all nodes recursively
  - Read local styles (`getLocalPaintStylesAsync`, etc.) and variables
  - Export selected node assets via `exportAsync` (PNG / SVG)
  - Send serialized data back via `figma.ui.postMessage()`
- [ ] **`plugin/ui.html`** (iframe):
  - Connect WebSocket to `ws://localhost:3000`
  - On `init`, start `setInterval` (e.g. 3s) sending `{ type: 'collect' }` to sandbox
  - On receiving data from sandbox, forward to websocket server as JSON over WebSocket
  - Handle reconnection on WS disconnect
- [ ] Build: `esbuild code.ts --bundle --outfile=dist/code.js`

### Phase 3: WebSocket Server

- [ ] **`websocket/index.ts`** (Hono + `ws`):
  - WebSocket endpoint — receive data from Figma plugin iframe
  - Cache latest snapshot in memory (node tree, styles, variables, assets as base64)
  - HTTP endpoints for MCP server:
    - `GET /tree` — full node tree
    - `GET /tree?nodeId=xxx` — subtree
    - `GET /styles` — local styles
    - `GET /variables` — variables
    - `GET /asset?nodeId=xxx` — exported asset bytes
  - Serve on port `3000`

### Phase 4: MCP Server

- [ ] **`mcp-server/index.ts`** (`@modelcontextprotocol/sdk`):
  - `connect` tool — ping proxy, return connection status
  - `get_nodes` tool — query `/tree` from proxy, filter by name/type/path
  - `get_node_by_id` tool — fetch single node with full properties
  - `get_styles` tool — list all local paint/text/effect/grid styles
  - `get_variables` tool — list variable collections and variables
  - `export_asset` tool — call proxy `/asset?nodeId=xxx`, return base64
  - `get_selection` tool — return what is currently selected in Figma
  - Error handling: timeout if proxy unreachable
- [ ] Register tools via StdioServerTransport (works with `npx figma-proxy-mcp`)

### Phase 5: Integration & Testing

- [ ] Start all three processes and verify end-to-end
- [ ] Test with real Figma file (at least 1 page, frames, text, components)
- [ ] Test export of vector (SVG) and raster (PNG) assets
- [ ] Test what happens when Figma file closes (graceful proxy timeout)
- [ ] TypeScript type checking: `npx tsc --noEmit` for proxy + MCP

## Architecture Notes

- **Why Figma Plugin instead of REST API?** Plugin runs client-side, no rate limits, direct document access. Trade-off: plugin only works while file is open.
- **Why hidden UI iframe?** WebSocket is not available in Figma sandbox. Hidden iframe provides browser APIs without distracting the user.
- **Why Hono?** Lightweight, fast, first-class WebSocket support, works with `ws` package, works with `@hono/node-server`.
- **Proxy message format:** All messages over WebSocket are `{ type: string, payload: any }`. Proxy responds with same format.

## Message Protocol (Plugin ↔ Proxy)

```typescript
// From plugin (via iframe WS)
{ type: 'snapshot', payload: { nodes: [...], styles: [...], variables: [...], selection: [...] } }
{ type: 'asset', payload: { nodeId: 'xxx', format: 'PNG', data: '<base64>' } }

// From proxy to plugin (ack)
{ type: 'ack', payload: { ok: true } }

// From MCP to proxy (HTTP)
GET  /tree              // latest snapshot
GET  /tree?nodeId=xxx   // single node
GET  /styles            // all styles
GET  /variables         // all variables
GET  /asset?nodeId=xxx  // asset bytes
```
