# figma-proxy-mcp

Give AI agents live, read-write access to any open Figma file — no REST API token, no rate limits, no stale exports.

Built for engineers doing design handoff and UX writers auditing copy at scale.

---

## How it works

```
AI Agent (Claude, Cursor, etc.)
    │  MCP over Streamable HTTP
    ▼
MCP Server :3001       — translates tool calls into RPC
    │  HTTP POST /rpc
    ▼
WebSocket Proxy :3000  — routes to the correct Figma file
    │  WebSocket
    ▼
Figma Plugin           — executes Figma Plugin API calls
    │
    ▼
Live Figma File
```

| Service | Port | Responsibility |
|---|---|---|
| `mcp-server` | 3001 | MCP protocol, tool registry, response post-processing |
| `websocket` | 3000 | WebSocket proxy, multi-file routing |
| `plugin` | — | Figma Desktop plugin, Plugin API execution |

---

## Quick start

### 1. Start the backend

```bash
docker compose up
```

Or run locally:

```bash
# Terminal 1
cd websocket && npm install && npm run dev

# Terminal 2
cd mcp-server && npm install && npm run dev
```

### 2. Load the Figma plugin

```bash
cd plugin && npm install && npm run build
```

In Figma Desktop: **Plugins → Development → Import plugin from manifest** → select `plugin/manifest.json`.

Run the plugin — the status dot turns green when connected to the proxy.

### 3. Connect your AI client

**Claude Code**
```bash
claude mcp add figma --transport http http://localhost:3001/mcp
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "figma": { "url": "http://localhost:3001/mcp" }
  }
}
```

**Cursor / Windsurf** — add `http://localhost:3001/mcp` as an MCP server in settings.

**Remote / tunneled server**
```bash
claude mcp add figma --transport http https://your-tunnel.example.com/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PROXY_URL` | `http://localhost:3000` | WebSocket proxy URL (used by mcp-server) |
| `MCP_PORT` | `3001` | MCP server port |
| `MCP_API_KEY` | — | Bearer token for `/mcp` endpoint auth |
| `MCP_PUBLIC_URL` | `http://localhost:3001` | Public base URL of the MCP server. Set to your tunnel URL (e.g. `https://xyz.ngrok.io`) so that `downloadUrl` values in image responses are reachable from the agent. |

---

## Tools

### Inspection

| Tool | Description |
|---|---|
| `get_document` | Full node tree of the current page |
| `get_selection` | Currently selected nodes |
| `get_node` | Node by ID. `maxNodes` controls tree depth. |
| `get_node_full` | Like `get_node` but auto-expands until the complete tree is returned |
| `get_slice_spec` | One-call slice bundle: full tree + layout spec + all SVG vectors |
| `get_design_context` | Depth-limited snapshot optimized for AI context windows |
| `get_metadata` | File name, pages, current page, file key |

### CSS & Layout

| Tool | Description |
|---|---|
| `get_css` | CSS properties: dimensions, flex, color, padding, border |
| `get_layout_spec` | Auto-layout: direction, gap, padding, alignment, sizing mode |
| `get_responsive_behavior` | Constraints, grow flags, min/max sizes |
| `get_corner_radii` | Per-corner radii and corner smoothing |
| `get_stroke_spec` | Per-side stroke weights, dash, cap, join |
| `get_effect_spec` | Drop shadows and blurs with full parameters |
| `get_styles` | All local paint, text, effect, and grid styles |

### Components & Tokens

| Tool | Description |
|---|---|
| `get_component_properties` | Property definitions, variant props, dev status |
| `get_instance_overrides` | Instance overrides and main component reference |
| `get_variables` | All variable collections, modes, and raw values |
| `get_variable_tokens` | Design tokens grouped by collection and mode |
| `get_node_variable_bindings` | Variables bound to a node with resolved mode values |

### Assets & Images

| Tool | Description |
|---|---|
| `get_screenshot` | Export nodes as PNG/JPG/PDF. Returns `downloadUrl` per node. |
| `get_svg` | Export nodes as SVG markup strings (inline, no download step). |
| `get_image` | Extract image fill bytes from a node. Returns `downloadUrl`. |
| `get_exportable_nodes` | Find all nodes with export settings or image fills in a scope. |
| `export_section_assets` | Batch-export all assets in a section. Returns `downloadUrl` per asset, or writes to disk if `outputDir` is given. |
| `get_colors` | All unique hex colors across fills and strokes |
| `get_fonts` | All fonts used in the document |

#### Downloading exported assets

`get_screenshot`, `get_image`, and `export_section_assets` store exported files on the MCP server (10-minute TTL) and return a `downloadUrl`. Save with one command:

```bash
curl -o assets/hero.png "http://localhost:3001/dl/<id>"
```

This works for any setup — local, Docker, or tunneled remote. Set `MCP_PUBLIC_URL` to your public tunnel URL so returned links are reachable from the agent's machine.

To skip the download step entirely, pass `outputPath` (single node) or `outputDir` (batch) to write directly to the MCP server's filesystem. This requires the MCP server and agent to share a filesystem (local or Docker volume mount).

### Text & Copy

| Tool | Description |
|---|---|
| `get_text_content` | Extract all text. Scope with `nodeId` (subtree) or `page` (page name). |
| `find_text_nodes` | Search text by keyword or regex across all pages |
| `find_placeholders` | Detect lorem ipsum, `{{braces}}`, `[brackets]`, "your text" patterns |
| `detect_text_overflow` | Find text nodes overflowing their clipped containers |
| `check_text_consistency` | Audit text style consistency across pages |
| `get_text_segments` | Per-segment rich text: font, size, color, hyperlinks |
| `get_typography_tokens` | All local text styles with full typography properties |
| `set_text_content` | Replace text in any text node |
| `create_text` | Create a new text node |

### Codegen

| Tool | Description |
|---|---|
| `to_html` | Convert a node to HTML with inline CSS |
| `to_html_page` | Convert an entire page to a standalone HTML document |
| `export_json` | Export a node as Figma REST API JSON (v1 format) |

---

## Usage examples

### Export all illustrations in a section

```
get_exportable_nodes({ nodeId: "2650:600" })
→ lists nodes with export settings or image fills

export_section_assets({ nodeId: "2650:600", format: "PNG", scale: 2 })
→ { exported: [{ name: "illus-seo", downloadUrl: "http://localhost:3001/dl/abc" }, ...] }

curl -o assets/illus-seo.png "http://localhost:3001/dl/abc"
```

### Get implementation-ready CSS

```
get_selection()
→ get_css, get_layout_spec, get_stroke_spec on the result
→ ready-to-copy CSS block
```

### Convert a page to HTML

```
to_html_page({ page: "Login" })
→ full HTML document with inline CSS
```

### Audit copy across the whole file

```
find_placeholders({})
→ every node with lorem ipsum, {{tokens}}, or [brackets] — with page and node ID

check_text_consistency({ group_by: "page" })
→ pages where text styles deviate from the norm
```

### Scope text extraction to one section

```
get_text_content({ nodeId: "2650:516" })
→ only text nodes within that frame — far smaller than dumping the whole file
```

### Update copy live in Figma

```
set_text_content({ nodeId: "3910:220", text: "Ship faster with AI-native tooling" })
→ change appears in Figma immediately
```

---

## Node ID formats

Both formats work — copy from the Figma URL or the plugin:

```
2650:516   ← internal format
2650-516   ← URL format (?node-id=2650-516)
```

---

## Multi-file support

Pass `fileKey` to target a specific open file:

```
get_document({ fileKey: "abc123XYZ" })
```

Omit `fileKey` when only one file is connected — the proxy routes automatically.

---

## CI/CD

The GitHub Actions workflow at `.github/workflows/docker-build-push.yml` builds and pushes both services to GitHub Container Registry on every push to `main`:

```
ghcr.io/<owner>/figma-proxy-mcp/mcp-server:latest
ghcr.io/<owner>/figma-proxy-mcp/mcp-server:<git-sha>
ghcr.io/<owner>/figma-proxy-mcp/websocket:latest
ghcr.io/<owner>/figma-proxy-mcp/websocket:<git-sha>
```

Uses `GITHUB_TOKEN` — no extra secrets required.
