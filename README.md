# figma-proxy-mcp

**Live Figma access for AI agents via MCP.** No REST API token. No rate limits. No stale exports.

An AI agent connected to this server can read design tokens, extract CSS, export assets, audit copy, and write text content — all against the file currently open in Figma Desktop.

---

## Table of contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Connecting an AI client](#connecting-an-ai-client)
- [Configuration](#configuration)
- [Tool reference](#tool-reference)
- [Recommended workflows](#recommended-workflows)
- [Multi-file support](#multi-file-support)
- [CI/CD](#cicd)

---

## Architecture

```
AI Agent (Claude, Cursor, Windsurf, …)
    │
    │  Streamable HTTP  (MCP protocol)
    ▼
┌─────────────────────────────────┐
│  mcp-server  :3001              │  Tool registry · RPC translation · Response processing
└─────────────┬───────────────────┘
              │  HTTP POST /rpc
              ▼
┌─────────────────────────────────┐
│  websocket proxy  :3000         │  Plugin connection manager · Multi-file routing
└─────────────┬───────────────────┘
              │  WebSocket
              ▼
┌─────────────────────────────────┐
│  Figma Plugin                   │  Runs inside Figma Desktop · Executes Plugin API calls
└─────────────┬───────────────────┘
              │  Plugin API
              ▼
        Live Figma File
```

---

## Prerequisites

- **Node.js 22+** — for local development
- **Docker + Docker Compose** — for containerised deployment
- **Figma Desktop** — the plugin requires the desktop Plugin API (not supported in the browser)

---

## Installation

### Option A — Docker (recommended)

```bash
cp .env.example .env   # set MCP_API_KEY and MCP_PUBLIC_URL if needed
docker compose up
```

### Option B — Local

```bash
cd websocket && npm install && npm run dev
cd mcp-server && npm install && npm run dev
```

### Figma plugin

Build once, then load into Figma Desktop:

```bash
cd plugin && npm install && npm run build
```

1. Open Figma Desktop
2. **Plugins → Development → Import plugin from manifest**
3. Select `plugin/manifest.json`
4. Run the plugin — the status indicator turns green when connected

The plugin reconnects automatically and persists the proxy URL across sessions.

---

## Connecting an AI client

### Claude Code

```bash
claude mcp add figma --transport http http://localhost:3001/mcp
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "figma": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### Cursor / Windsurf

Add `http://localhost:3001/mcp` as an MCP server in the IDE settings.

### Remote or tunneled server

```bash
claude mcp add figma --transport http https://your-tunnel.example.com/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PROXY_URL` | `http://localhost:3000` | WebSocket proxy address, consumed by the MCP server |
| `MCP_PORT` | `3001` | Listening port for the MCP server |
| `MCP_API_KEY` | — | When set, all `/mcp` requests must carry `Authorization: Bearer <key>` |
| `MCP_PUBLIC_URL` | `http://localhost:3001` | Public base URL of the MCP server. Used to construct `downloadUrl` values returned by image export tools. Must be set to your tunnel URL when the server is accessed remotely. |

---

## Tool reference

Node IDs accept both the internal colon format (`2650:516`) and the hyphen format found in Figma share URLs (`2650-516`). All tools accept an optional `fileKey` to target a specific open file; omit it when only one file is connected.

### Document & node inspection

| Tool | Key parameters | Description |
|---|---|---|
| `get_document` | `depth`, `maxNodes` | Full node tree of the current page |
| `get_selection` | — | Currently selected nodes |
| `get_node` | `nodeId`, `maxNodes` | Fetch a single node and its subtree. Increase `maxNodes` (up to 5000) for deeper trees. |
| `get_node_full` | `nodeId` | Like `get_node` but auto-retries with increasing `maxNodes` until the complete tree is returned — no truncation |
| `get_slice_spec` | `nodeId` | One-call slice bundle: complete node tree + layout specification + all SVG vector data |
| `get_design_context` | `nodeIds`, `depth`, `maxNodes` | Depth-limited snapshot of one or more nodes, optimised for AI context windows |
| `get_metadata` | — | File name, page list, current page, file key |

### CSS & layout

| Tool | Key parameters | Description |
|---|---|---|
| `get_css` | `nodeId` | CSS properties: dimensions, flex, color, padding, border-radius |
| `get_layout_spec` | `nodeId` | Full auto-layout spec — direction, gap, padding, alignment, sizing mode |
| `get_responsive_behavior` | `nodeId` | Constraints, grow flags, min/max sizes |
| `get_corner_radii` | `nodeId` | Per-corner radii and corner smoothing factor |
| `get_stroke_spec` | `nodeId` | Per-side stroke weights, dash pattern, cap and join style |
| `get_effect_spec` | `nodeId` | Drop shadows and blur effects with complete parameters |
| `get_styles` | — | All local paint, text, effect, and grid styles |

### Components & design tokens

| Tool | Key parameters | Description |
|---|---|---|
| `get_component_properties` | `nodeId` | Property definitions, variant props, dev-mode status |
| `get_instance_overrides` | `nodeId` | Per-instance overrides and main component reference |
| `get_variables` | — | All variable collections, modes, and raw values |
| `get_variable_tokens` | — | Design tokens grouped by collection and mode |
| `get_node_variable_bindings` | `nodeId` | Variables bound to a node with their resolved mode values |

### Assets & image export

| Tool | Key parameters | Description |
|---|---|---|
| `get_exportable_nodes` | `nodeId` | Scan a subtree for nodes that have export settings or image fills — use this to discover assets before exporting |
| `get_screenshot` | `nodeId/nodeIds`, `format`, `scale`, `outputPath`, `outputDir` | Export nodes as PNG, JPG, PDF, or SVG. Returns `downloadUrl` per raster node; SVG is returned inline. |
| `get_svg` | `nodeId/nodeIds`, `outputPath`, `outputDir` | Export nodes as inline SVG markup strings |
| `get_image` | `nodeId` | Extract raw image fill bytes from a node. Returns `downloadUrl`. |
| `export_section_assets` | `nodeId`, `format`, `scale`, `outputDir` | Batch-export every exportable asset in a section. Returns `downloadUrl` per asset, or writes files directly if `outputDir` is provided. |
| `get_colors` | — | All unique hex colors extracted from fills and strokes |
| `get_fonts` | — | All font families and styles used in the document |

#### Asset download model

`get_screenshot`, `get_image`, and `export_section_assets` write exported files to the MCP server's temp directory (TTL: 10 minutes) and return a `downloadUrl`. The agent retrieves the file with a single command:

```bash
curl -o assets/hero.png "http://localhost:3001/dl/<id>"
```

This pattern works uniformly across all deployment topologies — local, Docker, and tunneled remote. When the MCP server is tunneled, set `MCP_PUBLIC_URL` to the public URL so returned links are reachable from the agent's machine.

**Alternatively**, if the MCP server and the agent share a filesystem (local dev or Docker with a volume mount), pass `outputPath` (single node) or `outputDir` (batch) to write files directly without an intermediate download.

### Text & copy

| Tool | Key parameters | Description |
|---|---|---|
| `get_text_content` | `nodeId`, `page` | Extract all text. Scope to a subtree with `nodeId`, or a page with `page`. Omit both to dump the entire file. |
| `find_text_nodes` | `keyword`, `regex` | Search text nodes by keyword or regular expression across all pages |
| `find_placeholders` | — | Detect lorem ipsum, `{{double braces}}`, `[square brackets]`, and "your text here" patterns |
| `detect_text_overflow` | `page` | Find text nodes whose content overflows their clipped container |
| `check_text_consistency` | `group_by`, `page` | Audit text style consistency; group results by page, font size, or font family |
| `get_text_segments` | `nodeId`, `fields` | Per-segment rich text data: font, size, color, weight, hyperlink |
| `get_typography_tokens` | — | All local text styles with complete typography properties |
| `set_text_content` | `nodeId`, `text` | Replace the content of a text node. Handles mixed-font nodes. |
| `create_text` | `text`, `x`, `y`, `fontSize`, `parentId` | Create a new text node |

### Write operations

| Tool | Key parameters | Description |
|---|---|---|
| `set_text_content` | `nodeId`, `text` | Replace text content. Provides a clear error if the target node is not a TEXT node, listing any text children found inside it. |
| `set_node_visibility` | `nodeIds`, `visible` | Show or hide a set of nodes |
| `set_solid_fill` | `nodeId`, `color`, `opacity` | Replace a node's fill with a solid hex color |
| `set_node_properties` | `nodeId`, `name`, `x`, `y`, `width`, `height`, `opacity` | Update node geometry or name |
| `create_text` | `text`, `x`, `y`, `fontSize`, `parentId` | Create a new text node |

### Code generation

| Tool | Key parameters | Description |
|---|---|---|
| `to_html` | `nodeId` | Convert a node to HTML with inline CSS |
| `to_html_page` | `page` | Convert an entire Figma page to a standalone HTML document |
| `export_json` | `nodeId` | Export a node as Figma REST API JSON (v1 format) |

---

## Recommended workflows

### Design-to-code handoff

```
1. get_design_context({ nodeId: "<section>", depth: 2 })
   → section structure, spacing, color tokens

2. get_css({ nodeId: "<component>" })
   get_layout_spec({ nodeId: "<component>" })
   → implementation-ready CSS

3. get_variable_tokens({})
   → design token definitions for CSS custom properties
```

### Full-page slice

```
1. get_text_content({ nodeId: "<page-frame>" })
   → all copy scoped to this frame

2. get_exportable_nodes({ nodeId: "<page-frame>" })
   → list of all image/illustration nodes

3. export_section_assets({ nodeId: "<page-frame>", format: "PNG", scale: 2 })
   → { exported: [{ name: "hero", downloadUrl: "…" }, { name: "illus-seo", downloadUrl: "…" }] }

4. curl -o assets/hero.png "<downloadUrl>"
   → asset saved, no base64, no decoding
```

### Copy audit

```
1. find_placeholders({})
   → all lorem ipsum, {{tokens}}, [brackets] across every page

2. check_text_consistency({ group_by: "page" })
   → pages where heading/body styles deviate from the baseline

3. set_text_content({ nodeId: "<id>", text: "Production copy" })
   → update live in Figma
```

### Component exploration

```
1. get_slice_spec({ nodeId: "<component-frame>" })
   → node tree + layout + all vector SVGs in one response

2. get_instance_overrides({ nodeId: "<instance>" })
   → which props have been overridden and their values

3. get_node_variable_bindings({ nodeId: "<instance>" })
   → every token bound to this node and its resolved value per mode
```

---

## Multi-file support

When multiple Figma files are open with the plugin running in each, pass `fileKey` to route a call to a specific file:

```json
{ "tool": "get_document", "arguments": { "fileKey": "abc123XYZ" } }
```

Omit `fileKey` when only one file is connected — the proxy routes to the single active session automatically.

---

## CI/CD

`.github/workflows/docker-build-push.yml` builds both services and pushes to GitHub Container Registry on every push to `main`:

```
ghcr.io/<owner>/figma-proxy-mcp/mcp-server:latest
ghcr.io/<owner>/figma-proxy-mcp/mcp-server:<sha>

ghcr.io/<owner>/figma-proxy-mcp/websocket:latest
ghcr.io/<owner>/figma-proxy-mcp/websocket:<sha>
```

No additional secrets required — the workflow uses the built-in `GITHUB_TOKEN`.
