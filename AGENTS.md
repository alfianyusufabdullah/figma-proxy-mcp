# AGENTS.md — figma-proxy-mcp

## Architecture

```
AI Agent ──MCP/SSE──► MCP Server ──HTTP/JSON──► WebSocket Proxy (Hono) ◄──WS── Figma Plugin
```

- **Figma Plugin (code.ts)**: runs in Figma sandbox — full access to `figma.*` API but NO browser APIs (no WebSocket, no DOM, no `setTimeout`)
- **UI iframe (ui.html)**: runs in hidden `<iframe>` — full browser APIs but NO Figma access. Used for WebSocket + keep-alive
- Comm between sandbox ↔ iframe: `figma.ui.postMessage()` ↔ `window.onmessage`
- **Request-response protocol**: MCP server sends command via `POST /rpc` → WebSocket proxy forwards to plugin → plugin processes → response flows back. No polling.
- Connections are tracked by `fileKey` — supports multi-file via optional `fileKey` param

## Key Constraints (Figma Plugin)

- Plugin only runs while the Figma file is open in the editor
- `documentAccess: "dynamic-page"` required in manifest
- `networkAccess.allowedDomains` must list `localhost` (dev) + proxy address
- Must call `figma.closePlugin()` when done, OR keep UI alive for persistent connection
- Fetch API IS available in sandbox, but WebSocket is NOT — must use iframe for WS
- Plugin iframe has `null` origin — CORS only works with `Access-Control-Allow-Origin: *`

## Figma Sandbox Syntax Limitations

The sandbox is NOT a full browser engine. These WILL cause parse errors:

- `catch { }` without parameter — use `catch (_e) { }`
- Object spread `{...obj}` — use `Object.assign({}, obj)`
- Use `esbuild --target=es2017` to transpile these automatically

Before calling `figma.ui.postMessage()`, always strip Figma internal objects via `JSON.parse(JSON.stringify(data))` — raw Figma objects (paints, strokes, effects) contain internal Symbols that crash postMessage.

## Project Layout

```
figma-proxy-mcp/
├── plugin/             # Figma plugin (TypeScript, build with esbuild)
│   ├── manifest.json
│   ├── code.ts         # sandbox — reads document, handles plugin lifecycle
│   ├── serializer.ts   # comprehensive node/ paint/ effect serialization
│   └── ui.html         # iframe — WebSocket to proxy, setInterval triggers
├── websocket/          # WebSocket proxy server (Node.js + Hono)
│   └── src/index.ts
├── mcp-server/         # MCP server (TypeScript + @modelcontextprotocol/sdk)
│   └── src/index.ts
├── AGENTS.md
└── PLAN.md
```

## Commands

```bash
# Development — run all three concurrently
# 1. Figma plugin: use esbuild watcher
cd plugin && npx esbuild code.ts --bundle --outfile=dist/code.js --watch --target=es2017

# 2. WebSocket proxy server (port 3000)
cd websocket && npx tsx --watch src/index.ts

# 3. MCP server (port 3001, SSE transport)
cd mcp-server && npx tsx --watch src/index.ts
```

## MCP Client Configuration

MCP server uses SSE transport (`http://localhost:3001/sse`).

**Claude Desktop:**
```json
{
  "mcpServers": {
    "figma-proxy-mcp": {
      "type": "sse",
      "url": "http://localhost:3001/sse"
    }
  }
}
```

**Cursor / Cline / Roo Code:** Add MCP server with URL `http://localhost:3001/sse` (type: SSE).

## Figma Plugin Manifest Essentials

```json
{
  "name": "Figma Proxy MCP",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "ui.html",
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["http://localhost:3000", "ws://localhost:3000"],
    "devAllowedDomains": ["http://localhost:3000", "ws://localhost:3000"]
  },
  "editorType": ["figma"]
}
```

## Plugin Code Patterns

### Reading document tree (recursive)
```typescript
function collectNode(node: SceneNode): SerializedNode {
  const data: SerializedNode = {
    id: node.id, name: node.name, type: node.type,
    visible: node.visible, opacity: 'opacity' in node ? node.opacity : undefined,
    boundingBox: 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : undefined,
    fills: 'fills' in node ? node.fills : undefined,
    // ... other properties
  };
  if ('children' in node && node.children.length > 0) {
    data.children = node.children.map(collectNode);
  }
  return data;
}
```

### Exporting assets
```typescript
const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
// or SVG string:
const svg = await node.exportAsync({ format: 'SVG_STRING' });
// or REST-compatible JSON:
const json = await node.exportAsync({ format: 'JSON_REST_V1' });
```

### Hidden UI keep-alive pattern
```typescript
// code.ts
figma.showUI(__html__, { visible: false });
figma.ui.postMessage({ type: 'init' });

// ui.html
<script>
  window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (msg.type === 'init') {
      ws = new WebSocket('ws://localhost:3000');
      setInterval(() => {
        window.parent.postMessage({ pluginMessage: { type: 'collect' } }, '*');
      }, 2000);
    }
  };
</script>
```

## Data Flow

1. Plugin starts → hidden UI initializes WebSocket → sends `ready`
2. Each AI tool call is sent as command via MCP → `POST /rpc` → WebSocket → plugin
3. Plugin processes command (get_document, get_selection, etc.) → serializes result
4. Response flows back through same path
5. Supports multi-file via optional `fileKey` param

## Testing

- Figma plugin: `npx tsc --noEmit` for type checking; run in Figma Desktop via Plugins → Development
- Proxy + MCP: standard Node.js tests with `vitest`
