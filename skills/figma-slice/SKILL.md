---
name: figma-slice
description: Slice a Figma frame into production code and assets using figma-proxy-mcp, with visual fidelity verification. Use whenever implementing a Figma design, exporting assets, extracting CSS, or converting a frame to HTML. Trigger on: "slice this design", "implement this from Figma", "export assets", "build from Figma", "get CSS from Figma", "implement this design" — even if the user doesn't say "slice" explicitly. Always use this skill when a Figma node ID or frame is mentioned alongside any intent to implement or export.
compatibility: Requires figma-proxy-mcp MCP server. Add: claude mcp add figma --transport http http://localhost:3001/mcp
---

Slice a Figma frame into production-ready code with ≥95% visual fidelity. `$ARGUMENTS` is the node ID — omit to use the current selection via `get_selection`.

---

## Phase 1 — Capture Reference Screenshot

Before touching code or assets, take a screenshot of the Figma frame. This is the ground truth you'll compare against at the end.

```
get_screenshot({ nodeId: "$ARGUMENTS", format: "PNG", scale: 2 })
```

Download it immediately (URLs expire in 10 min):

```bash
curl -o reference/design-reference@2x.png "<downloadUrl>"
```

Keep this file. It is the visual target for the entire implementation.

---

## Phase 2 — Read the Design

```
get_slice_spec({ nodeId: "$ARGUMENTS" })
```

This is the most important call. It returns the complete node tree, auto-layout spec, and inline SVG data for every vector — all in one round-trip. Read carefully before proceeding. If `truncated: true`, follow up:

```
get_node_full({ nodeId: "$ARGUMENTS" })
```

---

## Phase 3 — Design Tokens (before any CSS)

```
get_variable_tokens({})
get_typography_tokens({})
```

Always do this before writing a single line of CSS. Nodes with variable bindings **must** use CSS custom properties — never hardcode a hex or pixel value that has a token behind it.

---

## Phase 4 — Copy

```
get_text_content({ nodeId: "$ARGUMENTS" })
find_placeholders({})
```

Get all text in the frame, then check for lorem ipsum or unfilled `{{tokens}}` before implementing.

---

## Phase 5 — Precise Asset Identification & Download

This is the most critical phase for accuracy. The goal is to download only the actual illustration/image nodes — not their parent containers.

### Step 5a — Find exportable nodes

```
get_exportable_nodes({ nodeId: "$ARGUMENTS" })
```

### Step 5b — Identify the correct node for each asset

For every node in the exportable list, inspect its type and children from the `get_slice_spec` tree:

| Node type | Has text children? | Action |
|---|---|---|
| `IMAGE` | No | ✅ Download this node |
| `VECTOR`, `BOOLEAN_OPERATION`, `ELLIPSE`, `STAR`, `POLYGON`, `LINE` | No | ✅ Use inline SVG from `get_slice_spec` — write directly to file |
| `FRAME`, `GROUP`, `COMPONENT` | **No text, only visuals** | ✅ Download this node |
| `FRAME`, `GROUP`, `COMPONENT` | **Has text children** | ❌ Do NOT download — traverse to find the visual-only child |

**Rule:** If a container node mixes visuals and text, go deeper. Find the innermost node that is purely the illustration or image. Download that specific node, not the container.

```
get_node_full({ nodeId: "<child-node-id>" })   # inspect if needed
```

### Step 5c — Download rasters

Export in one call, then curl immediately:

```
export_section_assets({ nodeId: "<specific-image-node-id>", format: "PNG", scale: 2 })
```

```bash
curl -o assets/<name>@2x.png "<downloadUrl>"
```

For a single node:

```
get_screenshot({ nodeId: "<specific-image-node-id>", format: "PNG", scale: 2 })
```

```bash
curl -o assets/<name>@2x.png "<downloadUrl>"
```

### Step 5d — Write SVG inline assets

Vectors from `get_slice_spec` already include inline SVG markup. Write those directly to `assets/` without making additional API calls. Only call `get_svg` for vectors missing from the spec.

---

## Phase 6 — CSS Extraction

```
get_css({ nodeId })              # dimensions, flex, color, padding, radius
get_layout_spec({ nodeId })      # auto-layout direction, gap, alignment, sizing mode
get_responsive_behavior({ nodeId })  # constraints, grow flags, min/max
```

Add only when visually needed:

```
get_effect_spec({ nodeId })      # shadows, blurs
get_stroke_spec({ nodeId })      # borders
get_corner_radii({ nodeId })     # mixed border-radius
```

---

## Phase 7 — Build HTML

```
to_html({ nodeId: "$ARGUMENTS" })
```

Use the output as a scaffold. Then:

1. Replace hardcoded colors → CSS custom properties (from Phase 3)
2. Replace placeholder image paths → downloaded asset paths (from Phase 5)
3. Fill in real copy (from Phase 4)
4. Verify all asset paths resolve correctly before proceeding

> ⚠️ Do **not** use `to_html_page` — its response is truncated and will produce incomplete output. Always call `to_html` scoped to a specific node ID.

### Responsive Implementation (mandatory)

The implementation **must be fully responsive** across all screen sizes. Never use fixed pixel widths on layout containers.

Guidelines:
- Use `width: 100%` / `max-width` on containers — never hardcoded `width: 375px` etc.
- Convert fixed Figma widths to `%`, `vw`, or `clamp()` where appropriate
- Use `gap`, `padding`, and `font-size` with relative units (`rem`, `em`, `clamp()`) instead of fixed `px` where the design allows scaling
- Auto-layout rows that would overflow on small screens → `flex-wrap: wrap`
- Images: always `max-width: 100%; height: auto`
- Typography: use `clamp(min, preferred, max)` for headings that need to scale
- Add breakpoints for at minimum: mobile (≤480px), tablet (481–1024px), desktop (>1024px)
- The Figma frame dimensions are the **desktop reference** — scale down gracefully from there

---

## Phase 8 — Visual Fidelity Check (≥95% target)

### Step 8a — Screenshot the implementation

Render the HTML implementation in a browser or headless renderer and capture a screenshot at the same dimensions as the Figma frame. Save it as `output/implementation@2x.png`.

### Step 8b — Side-by-side comparison

Place both screenshots side by side and perform a structured diff across these dimensions:

| Dimension | Check |
|---|---|
| **Layout** | Spacing, alignment, padding, margins match |
| **Typography** | Font family, size, weight, line-height, color match |
| **Colors** | All fills, backgrounds, and borders match |
| **Assets** | All images and illustrations are present and correctly placed |
| **Sizing** | Component dimensions match the design |
| **Effects** | Shadows, borders, radius match |
| **Responsiveness** | Layout adapts correctly at mobile (≤480px), tablet (481–1024px), and desktop (>1024px) — no overflow, no broken layout, no fixed-width containers |

Assign a fidelity score per dimension (0–100%) and calculate overall fidelity.

### Step 8c — Gate check

- **≥ 95% overall fidelity across all dimensions including responsiveness** → Done. Present the implementation.
- **< 95%** → Identify specific deltas, fix them, and repeat from Step 8a.

**Never present the implementation to the user until fidelity is ≥ 95%.**

Common issues to check when fidelity is low:
- CSS custom properties not applied (hardcoded values still present)
- Wrong asset node downloaded (container instead of inner image)
- Auto-layout gap/direction wrong → re-run `get_layout_spec`
- Font not loading → check typography tokens for font-family + fallback
- Shadow/stroke missing → run `get_effect_spec` / `get_stroke_spec`
- Fixed `width` on containers causing overflow on small screens → use `max-width` + `width: 100%`
- Missing `flex-wrap` on horizontal layouts → breaks at narrow viewports
- Images not fluid → add `max-width: 100%; height: auto`

---

## Quick Reference

| Need | Tool |
|---|---|
| Reference screenshot | `get_screenshot` on the root frame |
| Full structure + layout + SVGs | `get_slice_spec` |
| Complete tree without truncation | `get_node_full` |
| Design tokens | `get_variable_tokens`, `get_typography_tokens` |
| All text in frame | `get_text_content` |
| Which nodes have assets | `get_exportable_nodes` |
| Inspect a specific child node | `get_node_full` on child ID |
| Batch raster export | `export_section_assets` |
| Single node PNG | `get_screenshot` |
| SVG strings (fallback) | `get_svg` |
| CSS per node | `get_css`, `get_layout_spec` |
| HTML scaffold | `to_html` |
| Implementation screenshot | headless browser / screenshot tool |
