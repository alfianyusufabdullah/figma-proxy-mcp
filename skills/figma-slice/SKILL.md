---
name: find-slice
description: Slice a Figma frame into production-ready HTML/CSS with ≥90% visual fidelity via the figma-proxy-mcp tools.
---

Slice a Figma frame into production-ready HTML/CSS with **≥90% visual fidelity**. `$ARGUMENTS` is the node ID — omit to use the current selection (`get_selection`).

Three linear phases: **Ground → Build → Verify.** Run them in order. Do not present the result until the objective score is ≥90%.

---

## Phase 1 — Ground (one call)

```bash
mkdir -p reference assets output
```

Run **one** `slice_bundle` call. It does frame summary + slice spec (SVGs + spec to disk) + PNG export + text content in a single disk-first pass, and returns a compact manifest — heavy payloads stay on disk, not in context.

```
slice_bundle({ nodeId: "$ARGUMENTS", outputDir: "<abs-dir>", scale: 2 })
```

Outputs:
- `<dir>/slice-spec.json` — full node tree. Every node has a `styles` object (fills, strokes, effects, layout, constraints, typography). **This is the only CSS source you need.** Read it from disk.
- `<dir>/assets/*.svg` + `*.png` — all vectors and raster images, already downloaded.
- `<dir>/text-content.json` — all copy.
- returned manifest — `dimensions`, `sections` (each with `y`/`height`), `colors`, `fonts`, `assetCount`, `hasVariableTokens`, `hasTextStyles`, and the asset map (`nodeId → fileName → nodeName → parentName → type`).

Then capture the **reference screenshot** (ground truth for Phase 3):

```
get_screenshot({ nodeId: "$ARGUMENTS", format: "PNG", scale: 2, outputPath: "<abs>/reference/design-reference@2x.png" })
```

Record the returned `width`/`height` — that is the exact target pixel size for Phase 3.

### Conditional add-ons (only if the manifest says so)

- **Design tokens** — only if `hasVariableTokens: true` OR `hasTextStyles: true`:
  ```
  get_variable_tokens({})   get_typography_tokens({})
  ```
  Both return `{ hasTokens: false, reason }` if empty — stop there. Nodes with variable bindings **must** use CSS custom properties, never hardcoded values.
- **Placeholder check** — only if the copy in `text-content.json` looks like lorem ipsum / `{{braces}}` / `[brackets]`:
  ```
  find_placeholders({ nodeId: "$ARGUMENTS" })
  ```

### Escalation (huge frames only)

If `slice_bundle` truncates or `assetCount.vectors > 40` makes the single pass slow, split the work across sub-agents: one runs `get_slice_spec({ nodeId, outputDir, outputPath })`, another runs `export_section_assets` + `get_text_content`. Each returns only a <400-word summary — never let raw spec or SVG markup back into the main context. This is a fallback, not the default.

---

## Phase 2 — Build

Build HTML/CSS **directly from `slice-spec.json`**. Do not re-fetch styles — every node already carries them.

### Asset rule (only two things get downloaded — already done in Phase 1)

Only pure **IMAGE** fills and pure **VECTOR** nodes are assets. Everything else is CSS/HTML.

- `fills[].type === "IMAGE"` → `<img>` PNG from `assets/`.
- `VECTOR / BOOLEAN_OPERATION / ELLIPSE / STAR / POLYGON / LINE` → `.svg` from `assets/` (inline `<svg>` or `<img>`). Never reproduce in CSS.
- FRAME/GROUP/COMPONENT/INSTANCE with **any text descendant** → never export; build in CSS and traverse to the inner IMAGE/VECTOR child.
- **Specificity:** always use the innermost real image/vector node, never a container wrapping it.

If the spec is missing an IMAGE node you need, verify with `get_exportable_nodes({ nodeId })` (fallback only).

### styles → CSS map

| `styles` field | CSS |
|---|---|
| `fills[].type === "SOLID"` | `background-color` (text node → `color`) |
| `fills[].type === "GRADIENT_*"` | `background` |
| `layoutMode HORIZONTAL / VERTICAL` | `display:flex; flex-direction:row/column` |
| `itemSpacing` | `gap` (use gap, not margins) |
| `paddingTop/Right/Bottom/Left` | `padding` |
| `primaryAxisAlignItems` | `justify-content` (MIN→flex-start, MAX→flex-end, CENTER→center, SPACE_BETWEEN→space-between) |
| `counterAxisAlignItems` | `align-items` |
| `constraints` (non-flex child) | `position:absolute` placement |
| `effects[].type === "DROP_SHADOW"` | `box-shadow` |
| `cornerRadius` | `border-radius` |
| `strokes` | `border` |
| `fontName / fontSize / lineHeight / letterSpacing` | typography (import the correct font CDN; match weight exactly) |
| `characters` | text content (use real copy from `text-content.json`) |

### Responsive (mandatory — Figma frame is the desktop reference, scale down)

- Containers: `width:100%` + `max-width` — never hardcoded pixel widths.
- Fixed widths → `%` / `vw` / `clamp()`; spacing & font sizes → `rem` / `clamp()`.
- Rows that overflow → `flex-wrap:wrap`. Images → `max-width:100%; height:auto`.
- Breakpoints: mobile ≤480px, tablet 481–1024px, desktop >1024px.

Optional scaffold: `to_html({ nodeId, responsive:true, includeSvgPaths:true, assetPaths:"assets/" })` — needs cleanup (fix colors→tokens, asset paths, real copy, override conflicting values). Direct-from-spec is usually faster. Never use `to_html_page` (truncated).

Fallback CSS tools **only for nodes not in the spec** (dynamic/new instances): `get_node_styles({ nodeId })` — all specs in one shot. Never call these for nodes already in `slice-spec.json`.

---

## Phase 3 — Verify (objective gate, ≥90%)

Two objective gates, both from one script: **structural** (SSIM + pixel-similarity per section, ≥90%) and **color** (per-section ΔE sampling, <3). The agent's visual impression never decides pass/fail — vision is only for *diagnosing structural shifts*, via a **50%-transparent overlay** (ghosting makes position/size shifts instantly visible). Color never uses the eye at all — it's decided by sampled hex + ΔE.

**Step A — screenshot the implementation.** Render the HTML at the exact `width`/`height` from Phase 1 (no rounding drift). Save `output/implementation@2x.png`.

**Step B — score per-section (mandatory).** A single height delta shifts everything below it, collapsing a full-page diff (false negative). Always crop into sections and score each one.

Using the `sections` (`y`/`height`, ×2 for @2x) from the Phase 1 manifest, cut both `reference/design-reference@2x.png` and `output/implementation@2x.png` at the same boundaries. Crop each pair to equal height. Write one self-contained script (no third-party libs; inline `python3 -c "..."` is fine) that, per section pair:
1. decodes both PNGs to raw pixels;
2. resamples one to match if dimensions differ;
3. computes **pixel-similarity** (`1 − meanDiff/255`) and **SSIM** (windowed luma), then a combined section score (mean or min — pick one, stay consistent);
4. prints per-section scores + the overall = **lowest section score**.

In the **same script**, also produce a **full-page overlay** `output/overlay-full.png`: reference and implementation blended at 50/50 alpha (resample impl to the reference's dimensions first so pixels align). Where the two agree the overlay is crisp; where they disagree you get doubled/ghosted edges = a shift, size, or missing/extra element.

**Step B2 — color check (mandatory, runs with the score).** Structural scores can pass ≥90% while a color drifts (e.g. `#3B82F6`→`#2563EB`) — the eye and SSIM barely register it, but a wrong brand color is a real defect. So sample colors per section from both screenshots and compare in perceptual space.

For each section, pick sample points at the center of its main flat-color regions — background, primary buttons/CTAs, headings, cards. (Sample interiors, never edges: anti-aliasing at borders corrupts the reading. `slice-spec.json` fill values tell you which nodes are flat-color and roughly where.) In the same script, at each point average a small patch (e.g. 5×5 px) in reference and in implementation, convert both sRGB→LAB, and compute **ΔE** (CIE76 is fine). Print per-point `ΔE` with the sampled hex pair.
- **ΔE < 3 → pass** (imperceptible / anti-alias noise).
- **ΔE ≥ 3 → fail** that point; a section passes color only if all its points pass.

**Step C — gate (both must pass).**
- Overall structural ≥90% **and** every color point ΔE<3 → present the implementation.
- Structural <90% → **read `overlay-full.png` once** to spot which region ghosts worst (that's usually the section dragging the score down; cross-check with the per-section numbers). Then generate a **section overlay** for just that band — same 50/50 blend, cropped to the offending section's `y`/`height` — save `output/overlay-<section>.png` and read it to pinpoint the exact delta. Fix, re-run from Step A.
- Color fail (any ΔE≥3) → no screenshot read needed: the script already gave you the exact sampled-hex pair and its location. Trace that node in `slice-spec.json`, correct the CSS value (or bind the design token), re-run from Step A. Common cause: hardcoded value instead of the variable token, or a slightly-off manual hex.

Read budget per iteration: **one full-page overlay + at most one section overlay**, and only when structural fails. Color fixes need **zero** screenshot reads. Never re-read both raw screenshots — the overlay already contains both. Do not present until structural ≥90% and all colors ΔE<3.

Common fixes: hardcoded color → CSS custom property · wrong asset (container vs inner node) → use innermost · auto-layout direction wrong → recheck `styles.layoutMode` · font not loading → correct CDN for `styles.fontName.family` · shadow/stroke missing → `styles.effects` / `styles.strokes` · fixed-width container → `max-width` + `width:100%` · row breaks narrow → `flex-wrap` · signature element flattened → restore it.

---

## Tool quick reference

| Need | Tool |
|---|---|
| **Ground everything in one call** | `slice_bundle({ nodeId, outputDir, scale })` |
| Reference screenshot | `get_screenshot({ nodeId, outputPath })` |
| Design tokens (if summary flags them) | `get_variable_tokens`, `get_typography_tokens` |
| Placeholder check (if copy suspicious) | `find_placeholders({ nodeId })` |
| Asset candidates (fallback) | `get_exportable_nodes({ nodeId })` |
| SVG/PNG for a node not in bundle (fallback) | `get_svg`, `get_screenshot` |
| CSS for nodes not in spec (fallback) | `get_node_styles({ nodeId })` |
| Re-fetch a subtree past 5000-node ceiling | `get_node_full({ nodeId })` |
| HTML scaffold (optional) | `to_html({ nodeId, responsive, includeSvgPaths, assetPaths })` |