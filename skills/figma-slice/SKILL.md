---
name: figma-slice
description: Slice a Figma frame into production code and assets using figma-proxy-mcp, with visual fidelity verification. Use whenever implementing a Figma design, exporting assets, extracting CSS, or converting a frame to HTML. Trigger on: "slice this design", "implement this from Figma", "export assets", "build from Figma", "get CSS from Figma", "implement this design" — even if the user doesn't say "slice" explicitly. Always use this skill when a Figma node ID or frame is mentioned alongside any intent to implement or export.
compatibility: Requires figma-proxy-mcp MCP server. Add: claude mcp add figma --transport http http://localhost:3001/mcp
---

Slice a Figma frame into production-ready code with ≥95% visual fidelity. `$ARGUMENTS` is the node ID — omit to use the current selection via `get_selection`.

---

## Execution Model — Three-Stage Sub-Agent Dispatch

```
┌──────────────────────────────────────────────────┐
│           STAGE A — Grounding (parallel)          │
│                                                   │
│  [Sub-agent 1]          [Sub-agent 2]             │
│  Phase 1 + 3 + 4        Phase 2                   │
│  Screenshot +           Read Design               │
│  Tokens + Copy          (slice spec)              │
└──────────────┬────────────────────────────────────┘
               │ both agents complete
               ▼
┌──────────────────────────────────────────────────┐
│           STAGE B — Asset Download (1 agent)      │
│                                                   │
│  [Sub-agent 3]                                    │
│  Phase 5                                          │
│  Asset Identification, SVG extraction,            │
│  PNG download, manifest                           │
└──────────────┬────────────────────────────────────┘
               │ complete
               ▼
┌──────────────────────────────────────────────────┐
│           STAGE C — Build + Verify (sequential)   │
│                                                   │
│  Phase 6  →  Phase 7                              │
│  Build HTML  Fidelity Check                       │
└──────────────────────────────────────────────────┘
```

**Gate rules:**
- Do not begin Stage B until both Stage A sub-agents have completed.
- Do not begin Stage C until Stage B is complete.
- Do not present the implementation to the user until Phase 7 fidelity is ≥ 95%.

> **Single source of truth:** `get_slice_spec` returns the complete node tree with `styles` on every node — fills, layout, constraints, effects, strokes, typography. Do NOT call `get_css`, `get_layout_spec`, `get_responsive_behavior`, `get_effect_spec`, `get_stroke_spec`, or `get_corner_radii` for nodes already in the spec. Those are fallback-only tools for nodes discovered after the spec was fetched.

---

## Phase 1 — Capture Reference Screenshot
*[Sub-agent 1 — Stage A, parallel]*

Before touching code or assets, screenshot the Figma frame. This is the ground truth you'll compare against at the end.

```
get_screenshot({ nodeId: "$ARGUMENTS", format: "PNG", scale: 2 })
```

Download immediately (URLs expire in 10 min):

```bash
mkdir -p reference assets output
curl -o reference/design-reference@2x.png "<downloadUrl>"
```

---

## Phase 2 — Read the Design
*[Sub-agent 2 — Stage A, parallel]*

### Step 2a — Frame summary (fast pre-read)

```
get_frame_summary({ nodeId: "$ARGUMENTS" })
```

Returns: `dimensions`, `sections` (direct children with y/height), `colors` (top 20 hex), `fonts`, `assetCount` (images + vectors), `hasVariableTokens`, `hasTextStyles`.

Use this to plan: `hasVariableTokens` / `hasTextStyles` → signal to Sub-agent 1 whether Phase 3 tokens are needed. `assetCount` → shapes Phase 5.

### Step 2b — Full node tree

```
get_slice_spec({
  nodeId: "$ARGUMENTS",
  maxDepth: 5,
  excludeVectorPaths: true,
  includeSvgPaths: false
})
```

Returns the complete node tree. Every node includes a `styles` object with: fills, strokes, effects, layout (layoutMode, gap, padding, alignment, sizing), constraints, typography. **This is all the CSS data you need — do not fetch it again in Phase 6.**

`excludeVectorPaths: true` — strips detailed style data from VECTOR/ELLIPSE/STAR/POLYGON/LINE nodes (they can only be rendered as SVG anyway). Reduces response size 40–80% for illustration-heavy designs. Set to `false` only if you need fills/stroke colors from vector nodes.

`maxDepth` (1–20): 3–5 for large frames. If `truncated: true`, re-fetch the truncated subtree:

```
get_node_full({ nodeId: "<truncated-section-id>" })
```

`includeSvgPaths: true` embeds SVG markup inline per VECTOR node — use only when you need SVG content but no spec run exists yet (rare: usually get_svg fallback in Phase 5 covers this).

---

## Phase 3 — Design Tokens
*[Sub-agent 1 — Stage A, continues after Phase 1]*

> **Skip condition:** If Sub-agent 2's `get_frame_summary` returned `hasVariableTokens: false` AND `hasTextStyles: false`, skip this phase entirely.

```
get_variable_tokens({})
get_typography_tokens({})
```

Both return a descriptive shape: `{ hasTokens: false, reason: "..." }` or `{ hasTokens: true, collections: [...] }`. Stop processing on `hasTokens: false`.

Nodes with variable bindings **must** use CSS custom properties — never hardcode a value that has a token behind it.

---

## Phase 4 — Copy
*[Sub-agent 1 — Stage A, continues after Phase 3]*

```
get_text_content({ nodeId: "$ARGUMENTS" })
```

Check for lorem ipsum or `{{placeholder}}` patterns. If suspicious content is found, optionally scope a placeholder check:

```
find_placeholders({ nodeId: "$ARGUMENTS" })   ← optional, only if text looks suspicious
```

`find_placeholders` is **not a default step** — only call it when `get_text_content` reveals potential placeholder text.

---

## Phase 5 — Asset Identification & Download
*[Sub-agent 3 — Stage B]*

> ⛔ **HARD RULE: Only two node types are ever downloaded — pure `IMAGE` nodes and pure `VECTOR` nodes. Everything else is rendered in CSS/HTML.**

### Step 5a — Identify IMAGE nodes from the spec

Do NOT call `get_exportable_nodes` first. Use the `get_slice_spec` tree from Phase 2 to identify IMAGE fill nodes directly. `get_exportable_nodes` is a verification fallback, not a discovery tool.

Walk the spec tree and collect nodes where `styles.fills` contains a paint with `type: "IMAGE"`.

Only fall back to `get_exportable_nodes` if the spec tree doesn't give clear IMAGE identification:

```
get_exportable_nodes({ nodeId: "$ARGUMENTS" })   ← fallback only
```

### Step 5b — Eligibility test (mandatory for every candidate)

Apply this decision tree in order — stop at the first match:

```
Is the node type IMAGE fill (has fills[].type === "IMAGE")?
  → YES: ✅ ELIGIBLE — download as PNG (Step 5c)
  → NO: continue ↓

Is the node type one of: VECTOR, BOOLEAN_OPERATION, ELLIPSE, STAR, POLYGON, LINE?
  → YES: ✅ ELIGIBLE for SVG — check spec first (Step 5d)
  → NO: continue ↓

Is the node FRAME/GROUP/COMPONENT/INSTANCE?
  → Has ANY TEXT descendant?
      → YES: ❌ INELIGIBLE — traverse to find the pure visual child
      → NO: ✅ ELIGIBLE — prefer innermost IMAGE/VECTOR child over parent
  → Otherwise: ❌ INELIGIBLE — render in CSS
```

**Principle of specificity:** Always prefer the innermost node that is the actual illustration or image. Never download a container when a child IMAGE or VECTOR node can serve.

### Step 5c — Download IMAGE nodes

For batch export:

```
export_section_assets({ nodeId: "<image-node-id>", format: "PNG", scale: 2 })
```

```bash
curl -o assets/<name>@2x.png "<downloadUrl>"
```

For single node:

```
get_screenshot({ nodeId: "<image-node-id>", format: "PNG", scale: 2 })
```

```bash
curl -o assets/<name>@2x.png "<downloadUrl>"
```

> ⚠️ URLs expire in 10 minutes — curl immediately after each export call.

### Step 5d — Extract SVGs (spec first, API fallback)

1. Check the `get_slice_spec` response for inline SVG markup on the vector node (field `svgMarkup`, `svgData`, or look for SVG content in the node data).
2. If present → write directly to `assets/<name>.svg`. **No API call needed.**
3. If missing → call `get_svg` as fallback only:

```
get_svg({ nodeId: "<vector-node-id>" })
```

> Note: `get_svg` on INSTANCE nodes may return clip-path IDs from the master component — trust the node name rather than internal IDs.

### Step 5e — Asset manifest (required before Stage C)

Write a manifest listing every asset: node ID, node type, file path. If a file is not on this list, it does not exist, and the HTML must not reference it.

---

## Phase 6 — Build HTML
*[Stage C — sequential, starts after Stage B completes]*

### Step 6a — Scaffold (optional)

```
to_html({
  nodeId: "$ARGUMENTS",
  responsive: true,
  includeSvgPaths: true,
  assetPaths: "assets/"
})
```

`to_html` is **optional** — it produces a scaffold that needs cleanup. If you are comfortable building HTML directly from the `get_slice_spec` tree (which already has all layout, spacing, typography, colors), skip `to_html` and build directly. Direct-from-spec HTML requires fewer fixups and is often faster.

If you use the scaffold, apply in order:

1. Replace hardcoded colors → CSS custom properties from Phase 3
2. Verify asset paths match the Phase 5 manifest — fix any mismatches
3. Fill in real copy from Phase 4
4. Override any scaffold values that conflict with spec data

> ⚠️ Do **not** use `to_html_page` — its response is truncated. Always scope to a specific node ID.

### Step 6b — Building HTML from spec

Every node in the `get_slice_spec` tree has a `styles` object. Use it directly:

| `styles` field | CSS output |
|---|---|
| `fills[].type === "SOLID"` | `background-color` |
| `fills[].type === "GRADIENT_*"` | `background` |
| `layoutMode === "HORIZONTAL"` | `display: flex; flex-direction: row` |
| `layoutMode === "VERTICAL"` | `display: flex; flex-direction: column` |
| `itemSpacing` | `gap` |
| `paddingTop/Right/Bottom/Left` | `padding` |
| `primaryAxisAlignItems` | `justify-content` (MIN→flex-start, MAX→flex-end, CENTER→center, SPACE_BETWEEN→space-between) |
| `counterAxisAlignItems` | `align-items` |
| `constraints.horizontal` | `position: absolute` placement for non-flex children |
| `effects[].type === "DROP_SHADOW"` | `box-shadow` |
| `cornerRadius` | `border-radius` |
| `fontSize`, `fontName`, `lineHeight` | Typography properties |
| `characters` | Text content |

For VECTOR/ELLIPSE/STAR nodes: render as `<img src="assets/<name>.svg">` or inline `<svg>`. Do not attempt to reproduce in CSS.

### Step 6c — Fallback CSS tools (use only for nodes NOT in spec)

For nodes discovered or added after Phase 2 (e.g. dynamic content, new instances):

```
get_node_styles({ nodeId })   ← all 6 specs in one shot
```

Or individual fallbacks:

```
get_css({ nodeId })
get_layout_spec({ nodeId })
get_responsive_behavior({ nodeId })
get_effect_spec({ nodeId })
get_stroke_spec({ nodeId })
get_corner_radii({ nodeId })
```

> **Never call these for nodes already in the `get_slice_spec` tree.** The data is already there.

### Step 6d — Design execution

**Typography as personality.** Font pairing and type scale define the page's character. Family, weight, size, line-height, letter-spacing, and color must all match. If a font won't load, find the correct CDN import.

**Structure encodes meaning.** Every layout decision in the Figma exists for a reason. Use `gap` not margins for auto-layout. Preserve the visual hierarchy.

**Restraint over decoration.** Only add motion or hover states where they serve the interaction. Respect `prefers-reduced-motion`.

**Critique before shipping.** Does the rendered page look like the Figma frame or a generic template? If generic, identify what was flattened and fix it.

### Step 6e — Responsive implementation (mandatory)

- Containers: `width: 100%` + `max-width` — never hardcoded pixel widths
- Convert fixed Figma widths → `%`, `vw`, or `clamp()`
- Spacing and font sizes: `rem`, `em`, or `clamp(min, preferred, max)`
- Horizontal layouts that overflow at small screens: `flex-wrap: wrap`
- Images: `max-width: 100%; height: auto`
- Breakpoints: mobile (≤480px), tablet (481–1024px), desktop (>1024px)
- The Figma frame is the **desktop reference** — scale down from there

---

## Phase 7 — Visual Fidelity Check (≥95% target)
*[Stage C — sequential, after Phase 6]*

### Step 7a — Screenshot the implementation

Render HTML at Figma frame dimensions. Save as `output/implementation@2x.png`.

### Step 7b — Side-by-side comparison

Compare `reference/design-reference@2x.png` against `output/implementation@2x.png`:

| Dimension | Check |
|---|---|
| **Layout** | Spacing, alignment, padding, margins match |
| **Typography** | Font family, size, weight, line-height, color match |
| **Colors** | All fills, backgrounds, borders match — no hardcoded values where tokens exist |
| **Assets** | All images and illustrations present, correctly placed, correct node used |
| **Sizing** | Component dimensions match the design |
| **Effects** | Shadows, borders, radius match |
| **Responsiveness** | No overflow, no broken layout, no fixed-width containers at mobile/tablet/desktop |

### Step 7c — Gate check

- **≥ 95% overall** → Done. Present the implementation.
- **< 95%** → Identify specific deltas, fix them, repeat from Step 7a.

**Never present the implementation until fidelity is ≥ 95%.**

Common issues:
- Hardcoded colors → replace with CSS custom properties
- Wrong asset (container instead of inner node) → re-run eligibility test
- Auto-layout direction wrong → re-check `styles.layoutMode` in spec
- Font not loading → find CDN import for `styles.fontName.family`
- Shadow/stroke missing → check `styles.effects` / `styles.strokes` in spec
- Fixed width on containers → `max-width` + `width: 100%`
- Missing `flex-wrap` on rows → breaks at narrow viewports
- Images not fluid → `max-width: 100%; height: auto`
- Signature design element flattened → restore it

---

## Quick Reference

| Need | Stage | Tool |
|---|---|---|
| Reference screenshot | A / Sub-agent 1 | `get_screenshot` on root frame |
| Frame overview (sections, colors, fonts, asset count) | A / Sub-agent 2 | `get_frame_summary` |
| Full node tree (single source of truth) | A / Sub-agent 2 | `get_slice_spec` (use `excludeVectorPaths: true`, `maxDepth`) |
| Full tree without truncation | A / Sub-agent 2 | `get_node_full` |
| Design tokens | A / Sub-agent 1 | `get_variable_tokens`, `get_typography_tokens` (skip if hasTokens: false) |
| All text in frame | A / Sub-agent 1 | `get_text_content` |
| Placeholder check | A / Sub-agent 1 | `find_placeholders({ nodeId })` — optional, only if text looks suspicious |
| SVG extraction | B / Sub-agent 3 | From spec first; `get_svg` as fallback only |
| Raster export (IMAGE only) | B / Sub-agent 3 | `export_section_assets`, `get_screenshot` |
| Asset candidates (fallback) | B / Sub-agent 3 | `get_exportable_nodes` — only if spec doesn't identify IMAGE nodes |
| Inspect deep child node | B / Sub-agent 3 | `get_node_full` on child ID |
| CSS for nodes NOT in spec (fallback) | C | `get_node_styles({ nodeId })` |
| HTML scaffold (optional) | C | `to_html({ nodeId, responsive, includeSvgPaths, assetPaths })` |
| Implementation screenshot | C | headless browser / screenshot tool |
