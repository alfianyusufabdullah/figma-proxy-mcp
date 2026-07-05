export const toolList = [
  {
    name: 'get_document',
    description: 'Get the node tree of the current Figma page (visible top-level children serialized recursively), returning { pageName, nodes[], truncated }. Depth-limited to 3 levels and 500 nodes by default to stay token-efficient — truncated=true means the limit was hit, so raise depth/maxNodes or drill in with get_node on a specific ID. Use get_metadata to see other page names; this tool always reads the active page.',
    inputSchema: {
      type: 'object',
      properties: {
        depth: { type: 'number', description: 'Max depth to traverse (default 3). -1 = full tree, 0 = count only, 1+ = levels' },
        maxNodes: { type: 'number', description: 'Max nodes to return (default 500, range 10–5000)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_selection',
    description: 'Get the nodes currently selected on the active Figma page, serialized with their properties and children. Returns { selection[], truncated } (each subtree capped at 100 nodes; truncated=true means a selected subtree was cut off — use get_node/get_node_full on that node ID for the full tree). Returns an empty array if nothing is selected.',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_node',
    description: 'Get one node and its subtree by ID, serialized with geometry, styles, and children. Returns { node, truncated }; truncated=true means the subtree exceeded maxNodes and was cut off — raise maxNodes or use get_node_full to auto-expand. Invisible nodes are always skipped. Use excludeEmptyContainers/includeOnlyExportable to prune the tree.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID — colon format "2650:516" or hyphen format "2650-516" from Figma URLs both work' },
        maxNodes: { type: 'number', description: 'Max nodes to return (default 500, max 5000). Use get_node_full to auto-expand.' },
        excludeEmptyContainers: { type: 'boolean', description: 'Drop frames/groups/instances with no visual and no kept children (default false). Invisible nodes are always skipped.' },
        includeOnlyExportable: { type: 'boolean', description: 'Keep only nodes with export settings, image fills, or vector geometry, plus their ancestors (default false).' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_node_full',
    description: 'Like get_node, but auto-retries with a doubling maxNodes (500 → up to 5000) until the whole subtree fits with no truncation. Use for complete, guaranteed-untruncated trees; prefer get_node with an explicit maxNodes when you only need a shallow slice and want to limit tokens. Empty containers are pruned by default (excludeEmptyContainers defaults true here).',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID — "2650:516" or URL hyphen format "2650-516"' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_slice_spec',
    description: 'Get a complete slice specification for a node: full tree + layout + all SVG vectors in one call. Empty wrapper containers are pruned by default. TOKEN-SAVING: pass outputDir to write SVGs to disk (response returns metadata only, not markup — saves ~18K tokens on vector-heavy frames), and/or outputPath to write the whole spec to disk and get back a compact summary.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID of the frame or section to slice' },
        excludeEmptyContainers: { type: 'boolean', description: 'Prune frames/groups/instances with no visual and no kept children (default true). Set false to keep the full structural tree.' },
        includeOnlyExportable: { type: 'boolean', description: 'Keep only nodes with export settings, image fills, or vector geometry, plus their ancestors (default false).' },
        outputDir: { type: 'string', description: 'Write each SVG vector to a file in this directory (shared filesystem). svgs[] then returns {fileName, savedTo, viewBox, bytes} instead of raw markup. Omit for inline markup (legacy behavior).' },
        svgFilePrefix: { type: 'string', description: 'Optional prefix for SVG file names, e.g. "hero-" → hero-<name>.svg.' },
        omitSvgs: { type: 'boolean', description: 'If true, return svgs:[] entirely (tree kept intact). Use when you only need the tree/layout.' },
        outputPath: { type: 'string', description: 'Write the full spec (tree+layout+svg metadata) as JSON to this path; response returns only {savedTo, nodeCount, sections[], assetRefs[]}.' },
        stylesFormat: { type: 'string', enum: ['full', 'compact', 'classes'], description: 'full (default) = every style field. compact = drop default/null fields. classes = extract repeated styles into styleClasses{}, nodes reference via styleRef.' },
        round: { type: 'boolean', description: 'Round all dimensions/coordinates to nearest integer.' },
        precision: { type: 'integer', description: 'Max decimal digits when round=false (default 2, only applied if set).' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'slice_bundle',
    description: 'One disk-first call that runs get_frame_summary + get_slice_spec (SVGs + full spec to disk) + export_section_assets (PNG) + get_text_content. Returns a compact manifest; all heavy payloads land on disk. Use for the initial pass on a frame you intend to slice.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Frame or section node ID to slice' },
        outputDir: { type: 'string', description: 'Base directory for all outputs (shared filesystem). SVGs → <dir>/assets, spec → <dir>/slice-spec.json, PNGs → <dir>/assets, text → <dir>/text-content.json.' },
        scale: { type: 'number', description: 'PNG export scale factor 0.5–4 (default 2).' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId', 'outputDir'],
    },
  },
  {
    name: 'get_styles',
    description: 'List all local shared styles defined in the file, grouped by kind: { paints[], texts[], effects[], grids[] }. Each entry is a lightweight { id, name, key, type } — metadata only, not the style values. For actual values use get_typography_tokens (text styles) or get_effect_spec/get_stroke_spec on a node. Cached ~60s.',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_metadata',
    description: 'Get top-level file info: { fileName, currentPage, pages[] (each { id, name }), fileKey }. Use it to discover page names for tools that take a page filter (get_text_content, to_html_page, etc.) and to obtain the fileKey in multi-file setups. Cached ~30s.',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_design_context',
    description: 'Get a shallow, token-optimized snapshot for AI context: serializes the given nodeIds (or all visible top-level frames of the current page when omitted) and returns { nodes[], truncated }. Defaults are deliberately tight (depth 2, 300 nodes) to give quick orientation across several frames at once — for a single frame in full detail use get_node_full or get_slice_spec.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Target node IDs, one or many (omit for full page)' },
        depth: { type: 'number', description: 'Max depth (default 2)' },
        maxNodes: { type: 'number', description: 'Max nodes to return (default 300, range 10–5000)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_variables',
    description: 'List variable collections and their modes (shallow — variable IDs only, no names or resolved values). Use get_variable_tokens for full names, types, and per-mode values.',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_image',
    description: 'Extract the raw image bytes from nodes that have an image fill. Pass nodeIds[] for bulk, nodeId for one, or omit both for the current selection. Returns images[] (each with nodeId, format, downloadUrl) plus errors[] for nodes with no image fill. This returns the original embedded image, not a render — use get_screenshot to rasterize a node.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs with image fills (bulk). Omit both nodeIds and nodeId to use the current selection.' },
        nodeId: { type: 'string', description: 'Single node ID with an image fill' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_css',
    description: "Get Figma's generated CSS for a single node (the same output as Dev Mode's Inspect panel) as { nodeId, css } where css is a property→value map (width, height, display/flex, padding, gap, color, background, border-radius, box-shadow, font, etc.). Best for translating one node to code; for layout structure use get_layout_spec, and for whole-node HTML use to_html.",
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_fonts',
    description: 'Scan every text node on all pages and return the unique fonts in use as { fonts[] }, each a sorted "Family Style" string (e.g. "Inter Bold"). Document-wide inventory for setting up @font-face / font loading; for per-node or per-run typography use get_text_segments, and for named text styles use get_typography_tokens. Cached ~60s.',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_colors',
    description: 'Scan every node on all pages and return the unique SOLID colors used in fills and strokes as { colors[] } (sorted hex strings). Document-wide palette extraction; only solid paints are included (gradients/images are ignored), and opacity is not encoded. For a specific node\'s exact paints use get_css or get_stroke_spec, and for defined color tokens use get_variable_tokens. Cached ~30s.',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'find_text_nodes',
    description: 'Search all text nodes across every page by keyword (case-insensitive substring) or regex, and return matches as { results[] } (each { nodeId, name, text, page }). regex takes precedence over keyword when both are given; if neither is provided nothing matches. Use to locate the node IDs you then pass to set_text_content or get_text_segments.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Case-insensitive substring to match against text content' },
        regex: { type: 'string', description: 'Regex pattern (case-insensitive; overrides keyword when set)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_text_content',
    description: 'Dump the plain text of every text node (flat characters string per node, ignoring rich-text runs — use get_text_segments for those). Scoped by nodeId it returns { nodes[] ({ nodeId, name, text }), scopedTo }; unscoped it returns { pages: { <pageName>: [ { nodeId, name, text } ] } } across all pages (or one page via page). Strongly prefer nodeId or page on large files — the response grows with the document and a >50KB result is flagged with a hint.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Scope to a specific frame/section subtree (recommended for large files)' },
        page: { type: 'string', description: 'Page name filter — limits to one page (omit for all pages). Ignored when nodeId is set.' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_screenshot',
    description: 'Render one or many nodes to images (PNG/SVG/JPG/PDF). Pass nodeIds[] for bulk, nodeId for one, or omit both to export the current selection. Returns downloadUrl per node — save with: curl -o file.png "<downloadUrl>". SVG is returned inline as svg field. Optionally write directly to disk with outputPath (single node) or outputDir (multiple; requires shared filesystem with MCP server).',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to export (bulk). Omit both nodeIds and nodeId to use the current selection.' },
        nodeId: { type: 'string', description: 'Single node ID to export' },
        format: { type: 'string', enum: ['PNG', 'SVG', 'JPG', 'PDF'], description: 'Export format (default PNG)' },
        scale: { type: 'number', description: 'Scale factor 0.5–4 (default 2). PNG/JPG/PDF only.' },
        outputPath: { type: 'string', description: 'Write directly to this absolute path (single node, shared filesystem only).' },
        outputDir: { type: 'string', description: 'Write all nodes to this directory (shared filesystem only).' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_svg',
    description: 'Export one or many nodes to SVG. Pass nodeIds[] for bulk, nodeId for one, or omit both to export the current selection. Does NOT return raw SVG markup (too token-heavy): returns svgs[] with nodeId, name, type, viewBox, bytes, and a downloadUrl — fetch the markup with: curl -o file.svg "<downloadUrl>". Pass outputPath/outputDir to write the markup straight to disk instead. Nodes that fail are listed in errors[].',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to export as SVG (bulk). Omit both nodeIds and nodeId to use the current selection.' },
        nodeId: { type: 'string', description: 'Single node ID to export as SVG' },
        outputPath: { type: 'string', description: 'Absolute file path to write SVG to disk (single node only).' },
        outputDir: { type: 'string', description: 'Absolute directory path for multi-node SVG export. Files named by node name.' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'set_text_content',
    description: 'Replace text content of one text node (nodeId + text), or many in one call (updates[]). Not available in Figma Dev Mode.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID of the text node (single mode)' },
        text: { type: 'string', description: 'New text content (single mode)' },
        updates: {
          type: 'array',
          description: 'Bulk mode: list of { nodeId, text }. Continues past per-node failures and returns per-node results.',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: 'Node ID of the text node' },
              text: { type: 'string', description: 'New text content' },
            },
            required: ['nodeId', 'text'],
          },
        },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'set_node_visibility',
    description: 'Show or hide nodes. Not available in Figma Dev Mode.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to toggle visibility' },
        visible: { type: 'boolean', description: 'true = show, false = hide' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeIds', 'visible'],
    },
  },
  {
    name: 'set_solid_fill',
    description: 'Replace node fill(s) with a solid color — single (nodeId + color) or bulk (updates[]). Not available in Figma Dev Mode.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID (single mode)' },
        color: { type: 'string', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', description: 'Hex color, e.g. #ff0000 (single mode)' },
        opacity: { type: 'number', description: 'Opacity 0-1 (optional)' },
        updates: {
          type: 'array',
          description: 'Bulk mode: list of { nodeId, color, opacity? }. Continues past per-node failures and returns per-node results.',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: 'Node ID' },
              color: { type: 'string', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', description: 'Hex color' },
              opacity: { type: 'number', description: 'Opacity 0-1 (optional)' },
            },
            required: ['nodeId', 'color'],
          },
        },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'create_text',
    description: 'Create a new text node. Not available in Figma Dev Mode.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text content' },
        x: { type: 'number', description: 'X position (optional)' },
        y: { type: 'number', description: 'Y position (optional)' },
        fontSize: { type: 'number', description: 'Font size (optional)' },
        parentId: { type: 'string', description: 'Parent frame ID (optional)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'set_node_properties',
    description: 'Change node name, position, size, or opacity — single (nodeId) or bulk (updates[]). Not available in Figma Dev Mode.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID (single mode)' },
        name: { type: 'string', description: 'New name (optional)' },
        x: { type: 'number', description: 'X position (optional)' },
        y: { type: 'number', description: 'Y position (optional)' },
        width: { type: 'number', description: 'Width (optional)' },
        height: { type: 'number', description: 'Height (optional)' },
        opacity: { type: 'number', description: 'Opacity 0-1 (optional)' },
        updates: {
          type: 'array',
          description: 'Bulk mode: list of { nodeId, name?, x?, y?, width?, height?, opacity? }. Continues past per-node failures and returns per-node results.',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string', description: 'Node ID' },
              name: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              opacity: { type: 'number', description: 'Opacity 0-1' },
            },
            required: ['nodeId'],
          },
        },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_layout_spec',
    description: "Get a node's auto-layout configuration: layoutMode (HORIZONTAL/VERTICAL/NONE), itemSpacing & counterAxisSpacing (gap), padding {top,right,bottom,left}, primary/counter axis alignment, primary/counter axis sizing mode (FIXED/AUTO), layoutWrap, counterAxisAlignContent, and strokesIncludedInLayout — everything needed to reproduce the frame as flexbox/grid. Errors if the node has no auto-layout; use get_responsive_behavior for a child's own resizing rules.",
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Auto-layout frame/component node ID' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'get_responsive_behavior',
    description: "Get how a node responds to resizing: constraints {horizontal, vertical} (LEFT/RIGHT/CENTER/SCALE/STRETCH), layoutAlign, layoutGrow, layoutPositioning (AUTO/ABSOLUTE), layoutSizingHorizontal/Vertical (FIXED/HUG/FILL), and minWidth/maxWidth/minHeight/maxHeight. Complements get_layout_spec (which describes the parent container) by describing this node's own behavior inside it. Fields that don't apply to the node type come back undefined.",
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'get_corner_radii',
    description: "Get a node's corner rounding: cornerRadius is a single number when all four corners match, otherwise an object { topLeft, topRight, bottomLeft, bottomRight }; also returns cornerSmoothing (0–1, Figma's iOS-style squircle factor). Errors if the node type has no corner radius.",
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID (rectangle/frame/component/etc.)' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'get_stroke_spec',
    description: "Get a node's full stroke/border spec: strokes[] (serialized paints — color, opacity, type), strokeAlign (INSIDE/OUTSIDE/CENTER), strokeWeight (a single number, or { all, top, bottom, left, right } when per-side weights are set), dashPattern, strokeCap, strokeJoin, strokeMiterLimit, and strokeStyleId if bound to a shared style. Errors if the node has no strokes.",
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'get_effect_spec',
    description: "Get a node's visual effects as effects[] with full detail per effect: type (DROP_SHADOW/INNER_SHADOW/LAYER_BLUR/BACKGROUND_BLUR), color, offset {x,y}, radius, spread, and visibility — enough to reproduce box-shadow/filter in CSS. Also returns effectStyleId if bound to a shared effect style. Errors if the node type has no effects.",
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'get_component_properties',
    description: "Inspect a component, component set, or instance: definitions (each property's type — BOOLEAN/TEXT/INSTANCE_SWAP/VARIANT — with default and variant options), values (the current property values on an instance), variantProperties, plus key, remote (true if from an external library), description, and devStatus. Use for building a prop-driven component in code; for what an instance overrides vs. its main component use get_instance_overrides. Missing fields are simply omitted for the given node type.",
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Component, component-set, or instance node ID' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'get_instance_overrides',
    description: "For a component instance, get what differs from its main component: overrides[] (each { id, overriddenFields }), scaleFactor, isExposedInstance, exposedInstances[] ({ id, name }), and mainComponent ({ id, name, key } or null). Use to replicate an instance's customizations or trace it back to its source component. Errors if the node is not an INSTANCE.",
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Instance node ID' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'get_variable_tokens',
    description: 'Get the full design-token system: every local variable collection with its modes and, per variable, { id, name, key, resolvedType (COLOR/FLOAT/STRING/BOOLEAN), description, codeSyntax, scopes, hiddenFromPublishing, valuesByMode } where each mode value is the raw value or an { type:"ALIAS", id } reference to another variable. Returns { hasTokens:false, reason } when the file defines no variables. This is the resolved counterpart to the shallow get_variables. Cached ~60s.',
    inputSchema: { type: 'object', properties: { fileKey: { type: 'string', description: 'File key (omit if single file)' } } },
  },
  {
    name: 'get_node_variable_bindings',
    description: "Get which design-token variables a node is wired to: boundVariables (map of property → variable alias, e.g. fills, strokes, cornerRadius, itemSpacing bound to a variable), inferredVariables (values that match a variable but aren't explicitly bound), and resolvedVariableModes (which mode is active per collection for this node). Resolve the alias IDs against get_variable_tokens to get names/values. Fields are undefined if the node has none.",
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'export_json',
    description: "Export a node's full subtree in Figma's JSON_REST_V1 schema — byte-for-byte the same shape the Figma REST API returns for a node — with all nested children and raw properties. Use when you need the complete, unfiltered node data or REST-compatible output; prefer get_node/get_slice_spec for the leaner, token-optimized tree. Errors if the node type cannot be exported. Can be large.",
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'to_html',
    description: 'Convert a Figma node to pre-HTML with inline CSS for quick implementation. Optionally inline vector SVGs, emit responsive CSS, and rewrite asset URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to convert' },
        includeSvgPaths: { type: 'boolean', description: 'Inline actual SVG markup for vector nodes instead of placeholders (default false)' },
        responsive: { type: 'boolean', description: 'Emit responsive CSS (percentage/flex sizing) instead of fixed pixel positions (default false)' },
        assetPaths: { type: 'string', description: 'Path prefix to prepend to image/asset URLs in the generated HTML' },
        fileKey: { type: 'string' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'to_html_page',
    description: 'Convert a whole page to a standalone HTML document (inline CSS, absolute-positioned top-level frames). Returns { html (complete <!DOCTYPE html> string), sections[] (per-page { pageName, html }) }. Omit page for the current page, or pass a page name to convert that page (matching pages are loaded on demand). For a single node/frame use to_html, which also supports inline SVGs and responsive output.',
    inputSchema: { type: 'object', properties: { page: { type: 'string', description: 'Page name to convert (omit for the current page)' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } } },
  },
  {
    name: 'get_text_segments',
    description: 'Break a single text node into its styled runs: segments[], each with characters, start/end indices, and the requested style fields. Use this for mixed-formatting text (bold words, inline links, multi-color) where a flat characters string loses information. Defaults to fontName, fontSize, fills, lineHeight, letterSpacing, textCase, textDecoration, hyperlink; pass fields to request a specific subset. Errors if the node is not a TEXT node.',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Text node ID' }, fields: { type: 'array', items: { type: 'string' }, description: 'Styled-segment fields to include (e.g. ["fontName","fills","hyperlink"]). Omit for the default set.' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } }, required: ['nodeId'] },
  },
  {
    name: 'detect_text_overflow',
    description: 'QA check for clipped/overflowing text: finds text nodes whose bounding box extends past a parent that has clipsContent enabled (i.e. text is visually cut off), returning { overflowed[] } (each { nodeId, name, text, page }). Uses a 1px tolerance. Scan all pages by default, or pass page to limit to one. Ignores text inside non-clipping parents even if it visually overlaps siblings.',
    inputSchema: { type: 'object', properties: { page: { type: 'string', description: 'Page name (omit for all pages)' }, fileKey: { type: 'string' } } },
  },
  {
    name: 'find_placeholders',
    description: 'Find placeholder text (lorem ipsum, {{braces}}, [brackets], "your text", etc.). Scope to a subtree with nodeId, or omit to scan all pages.',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Scope to this frame/section subtree (omit to scan all pages)' }, fileKey: { type: 'string' } } },
  },
  {
    name: 'check_text_consistency',
    description: 'Audit typography consistency: collects every text node with its fontSize, fontFamily, lineHeight, color, and textCase, then returns { totalNodes, grouped } bucketed by the chosen key. Group by fontSize or fontFamily to spot one-off sizes/fonts that break the type scale (design-system drift), or by page (default) for a per-page breakdown. Optionally limit to one page.',
    inputSchema: { type: 'object', properties: { group_by: { type: 'string', enum: ['page', 'fontSize', 'fontFamily'], description: 'Bucket results by page (default), fontSize, or fontFamily' }, page: { type: 'string', description: 'Limit the scan to one page (omit for all pages)' }, fileKey: { type: 'string', description: 'File key (omit if single file)' } } },
  },
  {
    name: 'get_typography_tokens',
    description: 'Get all local text styles as reusable typography tokens: styles[], each with id, name, key, description, fontSize, fontName, lineHeight, letterSpacing, textCase, textDecoration, paragraphSpacing, paragraphIndent, listSpacing, and leadingTrim. Returns { hasStyles:false, reason } when the file defines no text styles. Use for a code type scale; get_fonts is the raw font inventory and get_text_segments reads one node\'s actual runs. Cached ~60s.',
    inputSchema: { type: 'object', properties: { fileKey: { type: 'string', description: 'File key (omit if single file)' } } },
  },
  {
    name: 'get_frame_summary',
    description: 'Get a lightweight summary of a frame: dimensions, top-level sections, colors, fonts, asset counts, and whether variable/text tokens are defined. Use this for initial orientation before diving into detailed spec. ~200 tokens vs thousands from get_slice_spec.',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Frame or section node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_exportable_nodes',
    description: 'Discover which nodes are assets worth exporting: walks a subtree (or the whole current page if nodeId is omitted) and returns { exportableNodes[] }, each with nodeId, name, type, parentId/parentName, width/height, exportSettings, and hasImageFill (true = raster image, false with no settings = vector geometry). Use it to plan asset extraction before calling get_screenshot, get_svg, or export_section_assets.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Scope to this frame/section subtree. Omit to search the current page.' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'export_section_assets',
    description: 'Export all image/exportable assets within a section. Without outputDir: returns downloadUrl per asset — save each with curl. With outputDir: writes files to disk (requires shared filesystem). Returns a manifest mapping nodeId → fileName → nodeName → parentName → type → kind for explicit asset-to-node mapping.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Frame or section node ID to export assets from' },
        outputDir: { type: 'string', description: 'Optional: write to this directory (shared filesystem only). Omit to get downloadUrls instead.' },
        format: { type: 'string', enum: ['PNG', 'SVG', 'JPG', 'PDF'], description: 'Export format (default PNG)' },
        scale: { type: 'number', description: 'Scale factor 0.5–4 (default 2)' },
        prefix: { type: 'string', description: 'Optional context prefix prepended to every file name (e.g. "service-card-2") for descriptive, contextual naming.' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
]
