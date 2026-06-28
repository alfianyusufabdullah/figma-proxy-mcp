---
name: figma-slice
description: Slice a Figma frame into production code and assets using figma-proxy-mcp. Use whenever implementing a Figma design, exporting assets from Figma, extracting CSS, or converting a frame to HTML. Trigger on: "slice this design", "implement this from Figma", "export assets", "build from Figma", "get CSS from Figma", even if the user doesn't say "slice" explicitly.
compatibility: Requires figma-proxy-mcp MCP server. Add: claude mcp add figma --transport http http://localhost:3001/mcp
---

Slice a Figma frame into production-ready code. `$ARGUMENTS` is the node ID — omit to use the current selection (`get_selection`).

## 1. Read the design

```
get_slice_spec({ nodeId: "$ARGUMENTS" })
```

This is the most important call. It returns the complete node tree, auto-layout spec, and inline SVG data for every vector in the frame — all in one round-trip. Read this carefully before doing anything else. If the response says `truncated: true`, follow up with `get_node_full` on the same ID to get the full tree.

## 2. Design tokens — before writing any CSS

```
get_variable_tokens({})
get_typography_tokens({})
```

Always do this before writing a single line of CSS. Nodes with variable bindings must use CSS custom properties, not raw hex or pixel values. Hardcoding a value that has a token behind it is the most common way a Figma implementation diverges from the design system.

## 3. Copy

```
get_text_content({ nodeId: "$ARGUMENTS" })
find_placeholders({})
```

Get all text scoped to the frame, then check for lorem ipsum or unfilled `{{tokens}}` before implementing.

## 4. Assets

Find what needs exporting:

```
get_exportable_nodes({ nodeId: "$ARGUMENTS" })
```

**Vectors** (VECTOR, BOOLEAN_OPERATION, ELLIPSE, STAR, POLYGON, LINE): `get_slice_spec` already returned their SVG markup inline — write those directly to files. Only call `get_svg` for vectors that weren't covered.

**Rasters**: export in one call, then download immediately (URLs expire in 10 min):

```
export_section_assets({ nodeId: "$ARGUMENTS", format: "PNG", scale: 2 })
```

```bash
curl -o assets/<name>@2x.png "<downloadUrl>"
```

For a single node: `get_screenshot({ nodeId, format: "PNG", scale: 2 })`, then curl the `downloadUrl`.

## 5. CSS

```
get_css({ nodeId })            # dimensions, flex, color, padding, radius
get_layout_spec({ nodeId })    # auto-layout direction, gap, alignment, sizing mode
get_responsive_behavior({ nodeId })  # constraints, grow flags, min/max
```

Add `get_effect_spec`, `get_stroke_spec`, or `get_corner_radii` only when the component visibly uses shadows, strokes, or mixed radii.

## 6. HTML

```
to_html({ nodeId: "$ARGUMENTS" })
```

Use the output as a scaffold. Substitute hardcoded colors with CSS custom properties from step 2, swap placeholder image paths with the downloaded asset paths from step 4, and fill in the real copy from step 3. For a full page: `to_html_page({ page: "<name>" })`.

---

| Need | Tool |
|---|---|
| Full structure + layout + SVGs | `get_slice_spec` |
| Complete tree without truncation | `get_node_full` |
| Design tokens | `get_variable_tokens`, `get_typography_tokens` |
| All text in frame | `get_text_content` |
| Which nodes have assets | `get_exportable_nodes` |
| Batch raster export | `export_section_assets` |
| Single node PNG | `get_screenshot` |
| SVG strings | `get_svg` |
| CSS per node | `get_css`, `get_layout_spec` |
| HTML scaffold | `to_html` |
