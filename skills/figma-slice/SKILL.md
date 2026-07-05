---
name: find-slice
description: Slice a Figma frame into production-ready HTML/CSS with ≥95% visual fidelity via the figma-proxy-mcp tools.
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
- Do not present the implementation to the user until Phase 7's **objective** fidelity score (SSIM + pixel-sim script) is > 95% — never on a subjective vision estimate.

> **Single source of truth:** `get_slice_spec` returns the complete node tree with `styles` on every node — fills, layout, constraints, effects, strokes, typography. Do NOT call `get_css`, `get_layout_spec`, `get_responsive_behavior`, `get_effect_spec`, `get_stroke_spec`, or `get_corner_radii` for nodes already in the spec. Those are fallback-only tools for nodes discovered after the spec was fetched.

### Token discipline (mandatory)

- **Vector-heavy frames → disk-first, in a sub-agent.** If `get_frame_summary` reports `assetCount.vectors > 20`, `get_slice_spec` MUST run inside Sub-agent 2 with `outputDir` set (write SVGs to disk) and `outputPath` set (write the spec to disk). The sub-agent returns only a summary < 400 words — the full spec and raw SVG markup MUST NOT enter the main context. Inline SVG markup on a large frame is ~18K tokens of pure waste.
- **Screenshot reads: max once per iteration.** Read the implementation screenshot at most once per fidelity iteration. For targeted fixes, crop per-section (hero, cards, footer) and compare regions — do not re-read the full-page screenshot every pass.
- **Fast-path known layouts.** If the layout is recognizable from `get_frame_summary` + `get_text_content` + screenshot, build the structure first and use `get_slice_spec` only to verify specific numbers (radius, shadow, padding) — not as the sole source.
- **Auto-skip tokens.** Skip `get_variable_tokens` / `get_typography_tokens` when `hasVariableTokens=false` AND `hasTextStyles=false` (see Phase 3).

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
get_slice_spec({ nodeId: "$ARGUMENTS" })
# vector-heavy frame → disk-first (keeps markup out of context):
get_slice_spec({ nodeId: "$ARGUMENTS", outputDir: "<abs>/assets", outputPath: "<abs>/output/slice-spec.json" })
```

Returns three things in **one call**:
- `node` — the complete node tree. Every node includes a `styles` object with fills, strokes, effects, layout (layoutMode, gap, padding, alignment, sizing), constraints, typography. **This is all the CSS data you need — do not fetch it again in Phase 6.**
- `layout` — the root's auto-layout spec.
- `svgs` — one entry per vector node. **Default (inline):** `{ nodeId, name, type, svg }` with full SVG markup. **With `outputDir`:** files are written to disk and each entry is `{ nodeId, name, type, fileName, savedTo, viewBox, bytes }` — metadata only, no markup. Phase 5 uses `savedTo` directly; you never call `get_svg` for a node already in the spec.

**Disk-first options:** `outputDir` writes SVGs to disk and returns metadata only (saves ~18K tokens on vector-heavy frames). `outputPath` writes the whole spec JSON to disk and returns `{ savedTo, nodeCount, sections[], assetRefs[] }`. `omitSvgs: true` drops SVGs entirely. `stylesFormat: "compact"` strips default fields; `round: true` rounds coordinates. All opt-in — default behavior is unchanged.

Node count auto-expands until the full tree fits (no `maxDepth` needed). `truncated: true` is only possible past the 5000-node ceiling on very large frames — re-fetch that subtree with `get_node_full({ nodeId: "<subtree-id>" })`.

**Size control (default-efficient):** `excludeEmptyContainers` defaults to `true` — empty wrapper frames/groups/instances (no visual, no kept children) are pruned automatically, and invisible nodes are always skipped. Add `includeOnlyExportable: true` to keep only nodes that become assets (image fills, vectors, export settings) plus their ancestors — useful when you only need the asset map. Pass `excludeEmptyContainers: false` if you need the full structural tree for debugging.

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

Batch export a whole section in one call. It returns `exported` (downloadUrls or savedTo) **and** a `manifest` — use the manifest directly for Phase 5e:

```
export_section_assets({ nodeId: "<section-id>", format: "PNG", scale: 2, prefix: "hero" })
```

Each `manifest` entry is `{ nodeId, fileName, nodeName, parentName, type, kind }`. Pass `prefix` to give files contextual names (`hero-<name>.png`) so the mapping to cards/sections is unambiguous — this resolves source-name-vs-usage confusion without a manual re-check. Omit `prefix` if node names are already descriptive.

```bash
curl -o "assets/<manifest.fileName>" "<downloadUrl>"
```

For a single node:

```
get_screenshot({ nodeId: "<image-node-id>", format: "PNG", scale: 2 })
```

The response includes `width`/`height` (exact exported pixels) alongside `downloadUrl` — record them; they're the ground truth for the Phase 7 size check.

```bash
curl -o assets/<name>@2x.png "<downloadUrl>"
```

> ⚠️ URLs expire in 10 minutes — curl immediately after each export call.

### Step 5d — Extract SVGs (already in the spec)

The `get_slice_spec` response includes an `svgs` array. **If you passed `outputDir`** (recommended for vector-heavy frames), the files are already on disk — use each entry's `savedTo`/`fileName`; there is nothing to write. **Otherwise (inline mode)**, each entry has an `svg` string — write it straight to `assets/<name>.svg`. Either way, **no `get_svg` call needed** — the spec already made it for you.

Only call `get_svg` for a vector node discovered *after* the spec was fetched (rare):

```
get_svg({ nodeId: "<vector-node-id>" })   ← fallback only, for nodes not in the spec
```

> Note: SVGs from INSTANCE nodes may carry clip-path IDs from the master component — trust the node name rather than internal IDs.

### Step 5e — Asset manifest (required before Stage C)

Assemble the final manifest from the `manifest` returned by `export_section_assets` (PNG assets) plus the `svgs` entries you wrote from the spec (SVG assets). Each row: `nodeId`, `kind`/`type`, `fileName`, `parentName` (usage context). If a file is not on this list, it does not exist, and the HTML must not reference it.

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

> **Mandatory gate rules (non-negotiable):**
> 1. The final score MUST NOT be a subjective vision estimate from the agent. Vision comparison (Step 7b) is for *diagnosing what to fix* only — it never decides pass/fail.
> 2. The agent MUST write a script — no external libraries or dependencies (Python recommended) — that computes **SSIM** and **pixel-similarity** between the two screenshots and prints a single objective score. That script's output is the only thing that decides the gate.
> 3. The loop MUST NOT stop until the objective score is **> 95%**. No exceptions, no "close enough".

### Step 7a — Screenshot the implementation

Render HTML at the Figma frame dimensions. Use the `width`/`height` returned by the Phase 1 `get_screenshot` as the exact target pixel size so the two screenshots align 1:1 (no rounding drift). Save as `output/implementation@2x.png`.

### Step 7b — Side-by-side comparison (diagnosis only)

Compare `reference/design-reference@2x.png` against `output/implementation@2x.png`. This pass exists to *locate deltas to fix* — it does not produce the final score.

| Dimension | Check |
|---|---|
| **Layout** | Spacing, alignment, padding, margins match |
| **Typography** | Font family, size, weight, line-height, color match |
| **Colors** | All fills, backgrounds, borders match — no hardcoded values where tokens exist |
| **Assets** | All images and illustrations present, correctly placed, correct node used |
| **Sizing** | Component dimensions match the design |
| **Effects** | Shadows, borders, radius match |
| **Responsiveness** | No overflow, no broken layout, no fixed-width containers at mobile/tablet/desktop |

### Step 7c — Objective measurement (mandatory, authoritative)

> **Compare per-section, not whole-page — mandatory.** A single height delta in one section shifts everything below it vertically, so a full-page SSIM/pixel diff collapses on drift even when each section is fine (false negative). Always crop into sections first, align each pair, then score each section on its own.

**Crop by section.** Use the `sections` (each with `y`/`height`) from Phase 2's `get_frame_summary` as the cut lines:
- **Reference** — slice `reference/design-reference@2x.png` at each section's `y`/`height` (×2 for the @2x scale).
- **Implementation** — either screenshot each section element directly, or slice `output/implementation@2x.png` at the same boundaries. Crop each pair to the same height before comparing so vertical drift never leaks between sections.

Write a self-contained script (no third-party libs — the agent picks its own approach) that, **for each section pair**:

1. Decodes both PNGs to raw pixels.
2. If dimensions differ, resamples one to match the other.
3. Computes two metrics:
   - **Pixel-similarity** — mean per-channel absolute difference, reported as `1 − meanDiff/255` (%).
   - **SSIM** — windowed structural similarity (luma), using the standard means/variances/covariance formula with a sliding window; average the per-window SSIM into a single score (%).
4. Prints per-section metrics plus a combined **objective score** (e.g. mean of the two, or the lower — pick one and keep it consistent).

The **overall gate score is the lowest section score** (weakest section decides), so drift or a broken section can't be masked by strong ones — and the per-section breakdown pinpoints exactly what to fix. Run it however is convenient — inline (e.g. `python3 -c "..."`) or a throwaway script; no need to persist a file. The agent's own visual impression carries no weight in the gate.

### Step 7d — Gate check

- **Objective score > 95%** → Done. Present the implementation.
- **≤ 95%** → Use Step 7b to identify specific deltas, fix them, repeat from Step 7a. Do not stop, do not present.

**Never present the implementation until the objective score from Step 7c is > 95%. A subjective "looks right" is not a pass.**

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
| Full node tree + layout + all SVGs (single source of truth) | A / Sub-agent 2 | `get_slice_spec` — empty containers pruned by default; add `includeOnlyExportable: true` for an asset-only tree |
| Re-fetch a subtree past the 5000-node ceiling | A / Sub-agent 2 | `get_node_full` |
| Design tokens | A / Sub-agent 1 | `get_variable_tokens`, `get_typography_tokens` (skip if hasTokens: false) |
| All text in frame | A / Sub-agent 1 | `get_text_content` |
| Placeholder check | A / Sub-agent 1 | `find_placeholders({ nodeId })` — optional, only if text looks suspicious |
| SVG extraction | B / Sub-agent 3 | Write from the spec's `svgs` array; `get_svg` only for nodes not in the spec |
| Raster export (IMAGE only) + manifest | B / Sub-agent 3 | `export_section_assets` (returns `manifest`; `prefix` for contextual names), `get_screenshot` (returns `width`/`height`) |
| Asset candidates (fallback) | B / Sub-agent 3 | `get_exportable_nodes` — only if spec doesn't identify IMAGE nodes |
| Inspect deep child node | B / Sub-agent 3 | `get_node_full` on child ID |
| CSS for nodes NOT in spec (fallback) | C | `get_node_styles({ nodeId })` |
| HTML scaffold (optional) | C | `to_html({ nodeId, responsive, includeSvgPaths, assetPaths })` |
| Implementation screenshot | C | headless browser / screenshot tool |
