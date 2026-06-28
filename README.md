# figma-proxy-mcp

A local MCP (Model Context Protocol) server that gives AI coding agents direct, live access to your open Figma file — purpose-built for engineers doing **design handoff** and **UX writers** managing copy at scale.

No Figma API token. No rate limits. No stale exports. The AI reads exactly what is currently open in Figma.

---

## Why this exists

Design handoff is slow because engineers have to manually translate Figma specs into code, and UX writers have to hunt through screens to audit copy. Both workflows become faster when an AI agent can read the live design directly:

- **Engineers** can ask: *"Give me the CSS for this card component"* or *"Export all illustrations in the Services section"* and get production-ready output.
- **UX Writers** can ask: *"Find every screen with placeholder lorem ipsum"* or *"Are the button labels consistent across all pages?"* and get an answer in seconds.

---

## Architecture

```
AI Agent (Claude, Cursor, etc.)
        |
        | MCP (Streamable HTTP)
        v
  MCP Server :3001          ← translates MCP tool calls to RPC
        |
        | HTTP POST /rpc
        v
  WebSocket Proxy :3000     ← routes requests to the right Figma file
        |
        | WebSocket
        v
  Figma Plugin              ← runs inside Figma Desktop, executes commands
        |
        | Plugin API
        v
  Live Figma File
```

Three services, each with a single responsibility:

| Service | Port | Role |
|---|---|---|
| `websocket` | 3000 | WebSocket proxy, manages plugin connections |
| `mcp-server` | 3001 | MCP server, exposes tools to AI agents |
| `plugin` | — | Figma plugin, executes Figma API calls |

---

## Prerequisites

- Node.js 22+
- Figma Desktop app (the plugin requires the desktop plugin API)
- An AI client that supports MCP (Claude Desktop, Cursor, Windsurf, etc.)

---

## Setup

### 1. WebSocket Proxy

```bash
cd websocket
npm install
npm run dev
# Running on http://localhost:3000
```

### 2. MCP Server

```bash
cd mcp-server
npm install
npm run dev
# Running on http://localhost:3001/mcp
```

Optionally set `MCP_API_KEY` to require a bearer token:

```bash
MCP_API_KEY=mysecret npm run dev
```

### 3. Figma Plugin

Build the plugin once:

```bash
cd plugin
npm install
npm run build
```

Load it in Figma Desktop:
1. Open Figma Desktop
2. Go to **Plugins > Development > Import plugin from manifest**
3. Select `plugin/manifest.json`
4. Run the plugin from the Plugins menu — it will appear as a small status panel

The plugin connects to the WebSocket proxy automatically. The status dot turns green when connected.

> By default the plugin connects to `ws://localhost:3000`. To connect to a different host, type the WebSocket URL in the plugin panel and click **Connect**. The URL is saved and restored on next open.

### 4. Connect your AI client

Add the MCP server to your AI client config:

**Claude Code CLI** — add to your project's `.mcp.json` or run:
```bash
claude mcp add figma --transport http http://localhost:3001/mcp
```

For a tunneled remote server with API key:
```bash
claude mcp add figma --transport http https://your-tunnel.example.com/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

**Claude.ai web** — go to Settings → Integrations → Add MCP server:
- URL: `https://your-tunnel.example.com/mcp`
- If API key is set, add header `Authorization: Bearer YOUR_API_KEY`

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "figma": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

**Cursor / Windsurf**: Add `http://localhost:3001/mcp` as an MCP server in settings.

---

## Docker

Both backend services have Dockerfiles using a multi-stage esbuild bundle. A single `node:22-alpine` image with no `node_modules`:

```bash
docker compose up
```

Or individually:

```bash
docker build -t figma-proxy-websocket ./websocket
docker run -p 3000:3000 figma-proxy-websocket

docker build -t figma-proxy-mcp-server ./mcp-server
docker run -p 3001:3001 -e PROXY_URL=http://host.docker.internal:3000 figma-proxy-mcp-server
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PROXY_URL` | `http://localhost:3000` | URL of the WebSocket proxy (used by mcp-server) |
| `MCP_PORT` | `3001` | Port for the MCP server |
| `MCP_API_KEY` | _(unset)_ | If set, all `/mcp` requests must include `Authorization: Bearer <key>` |
| `MCP_PUBLIC_URL` | `http://localhost:3001` | Public base URL of the MCP server. Set this to your tunnel URL when exposing remotely (e.g. `https://xyz.ngrok.io`). Used to construct `downloadUrl` in image tool responses. |

---

## Available Tools

### Design Inspection

| Tool | Description |
|---|---|
| `get_document` | Full node tree of the current Figma page |
| `get_selection` | Currently selected nodes |
| `get_node` | Single node by ID. Optional `maxNodes` to control tree size. |
| `get_node_full` | Same as `get_node` but auto-expands `maxNodes` until the full tree is returned |
| `get_slice_spec` | Full slice spec in one call: complete node tree + layout + all SVG vectors |
| `get_design_context` | Depth-limited snapshot optimized for AI context |
| `get_metadata` | File name, pages, current page, file key |

### CSS & Layout — for engineering handoff

| Tool | Description |
|---|---|
| `get_css` | CSS properties of a node (width, flex, color, padding, etc.) |
| `get_layout_spec` | Full auto-layout spec: direction, gap, padding, alignment, sizing mode |
| `get_responsive_behavior` | Constraints, layout alignment, grow flags, min/max sizes |
| `get_corner_radii` | Individual corner radii and corner smoothing |
| `get_stroke_spec` | Stroke weights (per-side), dash, cap, join |
| `get_effect_spec` | Drop shadows and blurs with full detail |
| `get_styles` | All local paint, text, effect, and grid styles |

### Components & Variables — for token-driven development

| Tool | Description |
|---|---|
| `get_component_properties` | Component/instance property definitions, variant props, dev status |
| `get_instance_overrides` | Instance overrides and main component reference |
| `get_variables` | All variable collections, modes, and raw values |
| `get_variable_tokens` | Design tokens grouped by collection and mode |
| `get_node_variable_bindings` | Which variables are bound to a node and their resolved modes |

### HTML Codegen — skip the spec, get the code

| Tool | Description |
|---|---|
| `to_html` | Convert a node to HTML with inline CSS |
| `to_html_page` | Convert an entire Figma page to a standalone HTML document |
| `export_json` | Export a node as Figma REST API JSON (v1 format) |

### Images & Assets

| Tool | Description |
|---|---|
| `get_screenshot` | Export nodes as PNG/JPG/PDF. Returns `downloadUrl` per node — save with `curl -o file.png "<downloadUrl>"`. SVG is returned inline. |
| `get_svg` | Export nodes as SVG markup strings (inline, directly usable). Supports `outputPath`/`outputDir` to write to disk. |
| `get_image` | Extract the image fill from a node. Returns `downloadUrl`. |
| `get_exportable_nodes` | Find all nodes with export settings or image fills within a section — use this before `export_section_assets` to preview what will be exported. |
| `export_section_assets` | Export all image assets in a section in one call. Returns `downloadUrl` per asset (works everywhere), or writes to disk if `outputDir` is provided (requires shared filesystem). |
| `get_colors` | All unique hex colors used across fills and strokes |
| `get_fonts` | All fonts used in the document |

#### How image downloads work

`get_screenshot`, `get_image`, and `export_section_assets` store exported files temporarily on the MCP server and return a `downloadUrl`. The agent downloads the file with a single `curl` command:

```bash
curl -o assets/hero.png "http://localhost:3001/dl/<id>"
```

Files expire after **10 minutes**. For tunneled setups, set `MCP_PUBLIC_URL` to your public URL so the returned links are reachable from the agent's machine.

If the MCP server shares a filesystem with the agent (local or Docker with a volume mount), you can skip the download step by passing `outputPath` or `outputDir` directly.

### UX Writing & Copy Audit

| Tool | Description |
|---|---|
| `get_text_content` | Dump all text from a section (`nodeId`), a page (`page`), or the entire file |
| `find_text_nodes` | Search text by keyword or regex across all pages |
| `find_placeholders` | Find lorem ipsum, `{{braces}}`, `[brackets]`, and "your text" patterns |
| `detect_text_overflow` | Find text nodes overflowing their clipped containers |
| `check_text_consistency` | Audit text style consistency across pages |
| `get_text_segments` | Rich text breakdown: per-segment font, size, color, hyperlinks |
| `get_typography_tokens` | All local text styles with full typography properties |
| `set_text_content` | Replace text in any text node directly from the AI |
| `create_text` | Create a new text node |

---

## Usage Examples

### Design handoff: export all assets in a section

> "Export all illustrations in the Services section."

```
1. get_exportable_nodes({ nodeId: "2650:600" })
   → lists all nodes with export settings or image fills

2. export_section_assets({ nodeId: "2650:600", format: "PNG", scale: 2 })
   → { exported: [{ name: "illus-seo", downloadUrl: "http://localhost:3001/dl/abc" }, ...] }

3. curl -o assets/illus-seo.png "http://localhost:3001/dl/abc"
   (one curl per asset, or batch with a loop)
```

---

### Design handoff: get implementation-ready specs

> "Get the CSS for the selected card component, including its auto-layout and border spec."

The agent calls `get_selection`, then `get_css`, `get_layout_spec`, and `get_stroke_spec` on the result — and returns a ready-to-copy CSS block.

---

> "Convert the Login page to HTML."

```
to_html_page({ page: "Login" })
```

Returns a full HTML document with inline CSS. Paste into your project as a starting point.

---

> "What design tokens does this button use?"

```
get_node_variable_bindings({ nodeId: "4029:512" })
```

Returns every variable bound to that node — color tokens, spacing tokens, and their resolved values per mode (light/dark).

---

### UX Writing: audit and update copy at scale

> "Find every screen that still has placeholder text."

```
find_placeholders({})
```

Returns node IDs, page names, and the placeholder content — sorted by page.

---

> "Get all the copy in the Hero section."

```
get_text_content({ nodeId: "2650:516" })
```

Scoping to a `nodeId` returns only text within that subtree — much smaller than dumping the whole file.

---

> "Are the CTA button labels consistent across the app?"

```
find_text_nodes({ regex: "(Get started|Start free|Try now|Sign up)" })
check_text_consistency({ group_by: "page" })
```

The agent cross-references both results and flags pages where labels deviate.

---

> "Update the hero headline on the Landing page to: 'Ship faster with AI-native tooling'"

```
set_text_content({ nodeId: "3910:220", text: "Ship faster with AI-native tooling" })
```

The change appears live in Figma immediately.

---

## Node ID format

Both formats are accepted — copy directly from the Figma URL or from the plugin:

- Colon format (internal): `2650:516`
- Hyphen format (Figma URL `?node-id=...`): `2650-516`

---

## Multi-file support

If you have multiple Figma files open with the plugin running in each, pass a `fileKey` to any tool to target a specific file:

```
get_document({ fileKey: "abc123XYZ" })
```

Omit `fileKey` when only one file is connected — the proxy routes to the single active connection automatically.

---

## CI/CD

A GitHub Actions workflow (`.github/workflows/docker-build-push.yml`) builds and pushes both services to GitHub Container Registry on every push to `main`:

```
ghcr.io/<owner>/figma-proxy-mcp/mcp-server:latest
ghcr.io/<owner>/figma-proxy-mcp/mcp-server:<git-sha>

ghcr.io/<owner>/figma-proxy-mcp/websocket:latest
ghcr.io/<owner>/figma-proxy-mcp/websocket:<git-sha>
```

No extra secrets needed — uses `GITHUB_TOKEN`.
