<a id="readme-top"></a>

<div align="center">

# figma-proxy-mcp

**Live Figma access for AI agents via MCP.**
No REST API token. No rate limits. No stale exports.

[![Build][build-shield]][build-url]
[![Node][node-shield]][node-url]
[![MCP][mcp-shield]][mcp-url]
[![Figma Plugin][figma-shield]][figma-url]

[Report Bug][issues-url] · [Request Feature][issues-url]

</div>

---

## Why this exists

Every existing path from an AI agent to a Figma file goes through the REST API: generate a token, respect rate limits, and read a version of the file that may already be stale. This project takes a different route — a plugin running inside Figma Desktop, bridged to your agent over a local proxy.

|  | Figma REST API | figma-proxy-mcp |
|---|---|---|
| Auth | Personal access token | API key (runtime, auto-generated) |
| Rate limits | Yes, per-token | None |
| Data freshness | Last saved version | Live document, including unsaved edits |
| Write access | No (read-only endpoints) | Yes — text content, fills, visibility, geometry |
| Selection awareness | No | Yes — reads your current selection |

An agent connected to this server can read design tokens, extract CSS, export assets, audit copy, and write text content — all against the file currently open in Figma Desktop.

<details>
<summary>Table of contents</summary>

- [Why this exists](#why-this-exists)
- [Quickstart](#quickstart)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Connecting an AI Tools](#connecting-an-ai-tools)
- [Slicing with the bundled skill](#slicing-with-the-bundled-skill)
- [Configuration](#configuration)
- [Tool reference](#tool-reference)
- [Contributing](#contributing)

</details>

---

## Quickstart

Sixty seconds from clone to connected agent:

```bash
# 1. Start the servers
docker compose up -d
#    → An API key is printed in the mcp-server logs (auto-generated on first start)

# 2. Build and load the plugin (once)
cd plugin && npm install && npm run build
#    → Figma Desktop: Plugins → Development → Import plugin from manifest
#    → select plugin/manifest.json, run the plugin
#    → paste the ws://... URL from step 1 logs into the Proxy URL field, click Connect

# 3. Connect your agent (use the same apiKey from step 1)
claude mcp add figma --transport http "http://localhost:3001/mcp?apikey=abc123"
```

Need a new key later? `curl http://localhost:3001/generate-apikey` returns a fresh key + ready-to-paste URLs.

Ask your agent to `get_metadata` — if it returns your file name, you're live.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

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
│  websocket proxy  :3000         │  Plugin connection manager · apiKey-namespaced routing
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

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Prerequisites

- **Node.js 22+** — for local development
- **Docker + Docker Compose** — for containerised deployment
- **Figma Desktop** — the plugin requires the desktop Plugin API (not supported in the browser)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Installation

### Option A — Docker (recommended)

```bash
docker compose up
```

Set `API_KEY` (pre-shared key) or `MCP_PUBLIC_URL` (remote access) in your environment — see [Configuration](#configuration).

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

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Connecting an AI Tools

The MCP server speaks **Streamable HTTP** at `http://localhost:3001/mcp`. All connections require an `apikey` query parameter — the server prints one at startup, or generate a new one with `curl http://localhost:3001/generate-apikey`.

> Before connecting: the two servers must be running and the Figma plugin must be active (green indicator) in Figma Desktop. Without the plugin, the client connects fine but every tool call returns *"No Figma plugin connected. Run the plugin in Figma first."*

### Claude Code

```bash
claude mcp add figma --transport http "http://localhost:3001/mcp?apikey=YOUR_API_KEY"
```

Verify with `claude mcp list` — `figma` should report ✔ connected.

### Claude Desktop

Edit the config file for your OS:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "figma": {
      "url": "http://localhost:3001/mcp?apikey=YOUR_API_KEY"
    }
  }
}
```

Restart Claude Desktop after saving — MCP servers are only loaded at startup. The `figma` server appears under the tools (🔨) icon when connected.

### Cursor

Create or edit `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for all projects):

```json
{
  "mcpServers": {
    "figma": {
      "url": "http://localhost:3001/mcp?apikey=YOUR_API_KEY"
    }
  }
}
```

Then enable the server under **Settings → MCP** — it should list the available tools.

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "figma": {
      "serverUrl": "http://localhost:3001/mcp?apikey=YOUR_API_KEY"
    }
  }
}
```

Refresh from **Settings → Cascade → MCP Servers** after saving.

### Remote or tunneled server

To reach the server from another machine, expose port 3001 through a tunnel (Cloudflare Tunnel, ngrok, Tailscale Funnel, …), then point the client at the public URL:

```bash
claude mcp add figma --transport http "https://your-tunnel.example.com/mcp?apikey=YOUR_API_KEY"
```

Two server-side settings matter here (see [Configuration](#configuration)):

- **`API_KEY`** — always set this on a publicly reachable server via env var; without it anyone with the URL can read and modify your open Figma file.
- **`MCP_PUBLIC_URL`** — set to the tunnel URL so asset `downloadUrl`s returned by export tools are reachable from the agent's machine.

### Smoke test

Regardless of client, ask the agent to call `get_metadata`. A correct setup returns the open file's name, page list, and file key. If it fails:

| Symptom | Likely cause |
|---|---|
| Connection refused | MCP server not running on 3001 |
| 401 Unauthorized | Missing or invalid `apikey` query parameter |
| "No Figma plugin connected" | Plugin not running, or API key mismatch between plugin and client |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Slicing with the bundled skill

For design-to-code slicing, don't drive the tools by hand — this repo ships a `figma-slice` skill that orchestrates the full pipeline (reference screenshot, spec extraction, asset export, HTML build, and a ≥95% visual fidelity gate). Install it with:

```bash
npx skills add alfianyusufabdullah/figma-proxy-mcp
```

Then invoke it from your agent with a node ID, or with nothing to slice the current Figma selection.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PROXY_URL` | `http://localhost:3000` | WebSocket proxy address, consumed by the MCP server |
| `MCP_PORT` | `3001` | Listening port for the MCP server |
| `API_KEY` | auto-generated | Pre-shared API key for multiplexing. Auto-generated at startup if not set. Call `GET /generate-apikey` to rotate. |
| `MCP_PUBLIC_URL` | `http://localhost:3001` | Public base URL of the MCP server. Used to construct `downloadUrl` values returned by image export tools. Must be set to your tunnel URL when the server is accessed remotely. |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Tool reference

Node IDs accept both the internal colon format (`2650:516`) and the hyphen format found in Figma share URLs (`2650-516`). All tools accept an optional `fileKey` to target a specific open file; omit it when only one file is connected under your API key.

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
| `set_text_content` | `nodeId`, `text` — or `updates[]` | Replace text content. Provides a clear error if the target node is not a TEXT node, listing any text children found inside it. |
| `set_node_visibility` | `nodeIds`, `visible` | Show or hide a set of nodes |
| `set_solid_fill` | `nodeId`, `color`, `opacity` — or `updates[]` | Replace a node's fill with a solid hex color |
| `set_node_properties` | `nodeId`, `name`, `x`, `y`, `width`, `height`, `opacity` — or `updates[]` | Update node geometry or name |
| `create_text` | `text`, `x`, `y`, `fontSize`, `parentId` | Create a new text node |

`set_text_content`, `set_solid_fill`, and `set_node_properties` accept an `updates` array for bulk edits — one call updates many nodes, keeps going past per-node failures, and returns `{ results, succeeded, failed }` with a per-node error message for each failure:

```json
{ "tool": "set_text_content", "arguments": { "updates": [
  { "nodeId": "2650:516", "text": "Sign up free" },
  { "nodeId": "2650:517", "text": "No credit card required" }
] } }
```

### Code generation

| Tool | Key parameters | Description |
|---|---|---|
| `to_html` | `nodeId` | Convert a node to HTML with inline CSS |
| `to_html_page` | `page` | Convert an entire Figma page to a standalone HTML document |
| `export_json` | `nodeId` | Export a node as Figma REST API JSON (v1 format) |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

Bug reports and feature requests are welcome — [open an issue][issues-url]. For code changes:

```bash
npm install                 # root dev tooling (ESLint)
npm run lint                # type-aware lint across all three services
npm run typecheck           # tsc --noEmit for websocket + mcp-server
```

Keep pull requests scoped to one change, and make sure `lint` and `typecheck` pass before submitting.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[build-shield]: https://img.shields.io/github/actions/workflow/status/alfianyusufabdullah/figma-proxy-mcp/docker-build-push.yml?branch=main&style=flat-square
[build-url]: https://github.com/alfianyusufabdullah/figma-proxy-mcp/actions/workflows/docker-build-push.yml
[node-shield]: https://img.shields.io/badge/node-%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white
[node-url]: https://nodejs.org
[mcp-shield]: https://img.shields.io/badge/MCP-Streamable%20HTTP-blueviolet?style=flat-square
[mcp-url]: https://modelcontextprotocol.io
[figma-shield]: https://img.shields.io/badge/Figma-Desktop%20Plugin-F24E1E?style=flat-square&logo=figma&logoColor=white
[figma-url]: https://www.figma.com/plugin-docs/
[issues-url]: https://github.com/alfianyusufabdullah/figma-proxy-mcp/issues
