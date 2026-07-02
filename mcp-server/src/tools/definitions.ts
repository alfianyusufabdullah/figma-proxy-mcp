export const toolList = [
  {
    name: 'get_document',
    description: 'Get the full node tree of the current Figma page',
    inputSchema: {
      type: 'object',
      properties: {
        depth: { type: 'number', description: 'Max depth to traverse. -1 = full tree, 0 = count only, 1+ = levels' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_selection',
    description: 'Get currently selected nodes in Figma',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_node',
    description: 'Get a specific Figma node by ID',
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
    description: 'Get a Figma node with auto-expanding maxNodes until the full tree is returned (no truncation)',
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
    description: 'Get a complete slice specification for a node: full tree + layout + all SVG vectors in one call. Empty wrapper containers are pruned by default to reduce output size.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID of the frame or section to slice' },
        excludeEmptyContainers: { type: 'boolean', description: 'Prune frames/groups/instances with no visual and no kept children (default true). Set false to keep the full structural tree.' },
        includeOnlyExportable: { type: 'boolean', description: 'Keep only nodes with export settings, image fills, or vector geometry, plus their ancestors (default false).' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_styles',
    description: 'Get all local styles (paint, text, effect, grid)',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_metadata',
    description: 'Get file name, pages, current page, and file key',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_design_context',
    description: 'Get a depth-limited snapshot of the design (optimized for AI context)',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Target node IDs (omit for full page)' },
        depth: { type: 'number', description: 'Max depth (default 2)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_variables',
    description: 'Get all variable collections, modes, and values',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_image',
    description: 'Extract the actual image bytes from a node with an image fill',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID with an image fill' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_css',
    description: 'Get CSS properties of a node (width, flex, color, padding, etc.)',
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
    description: 'List all fonts used in the document',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_colors',
    description: 'Extract all unique hex colors from fills and strokes in the document',
    inputSchema: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'find_text_nodes',
    description: 'Search text nodes by keyword or regex across all pages',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search keyword (case-insensitive)' },
        regex: { type: 'string', description: 'Regex pattern (optional, overrides keyword)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_text_content',
    description: 'Dump all text content. Scope with nodeId (subtree) or page (page name) to avoid large responses.',
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
    description: 'Export nodes as images. Returns downloadUrl per node — save with: curl -o file.png "<downloadUrl>". SVG is returned inline as svg field. Optionally write directly to disk with outputPath/outputDir (requires shared filesystem with MCP server).',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to export' },
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
    description: 'Export nodes as SVG markup strings. Use outputPath/outputDir to write directly to disk.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to export as SVG' },
        nodeId: { type: 'string', description: 'Single node ID to export as SVG' },
        outputPath: { type: 'string', description: 'Absolute file path to write SVG to disk (single node only).' },
        outputDir: { type: 'string', description: 'Absolute directory path for multi-node SVG export. Files named by node name.' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'set_text_content',
    description: 'Replace text content of a text node',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID of the text node' },
        text: { type: 'string', description: 'New text content' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId', 'text'],
    },
  },
  {
    name: 'set_node_visibility',
    description: 'Show or hide nodes',
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
    description: 'Replace a node fill with a solid color',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID' },
        color: { type: 'string', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', description: 'Hex color (e.g. #ff0000)' },
        opacity: { type: 'number', description: 'Opacity 0-1 (optional)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId', 'color'],
    },
  },
  {
    name: 'create_text',
    description: 'Create a new text node',
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
    description: 'Change node name, position, size, or opacity',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID' },
        name: { type: 'string', description: 'New name (optional)' },
        x: { type: 'number', description: 'X position (optional)' },
        y: { type: 'number', description: 'Y position (optional)' },
        width: { type: 'number', description: 'Width (optional)' },
        height: { type: 'number', description: 'Height (optional)' },
        opacity: { type: 'number', description: 'Opacity 0-1 (optional)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'get_layout_spec',
    description: 'Get full auto-layout specification (direction, gap, padding, alignment, sizing)',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_responsive_behavior',
    description: 'Get constraints, layout alignment, grow, positioning, and min/max sizes',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_corner_radii',
    description: 'Get individual corner radii and corner smoothing',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_stroke_spec',
    description: 'Get full stroke specification including per-side weights, dash, cap, join',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_effect_spec',
    description: 'Get effects list with full shadow/blur details',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_component_properties',
    description: 'Get component/instance property definitions, current values, variant props, dev status',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Component/Instance node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_instance_overrides',
    description: 'Get instance overrides, exposed instances, main component',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Instance node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_variable_tokens',
    description: 'Get all variable collections, modes, and values (design tokens)',
    inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } } },
  },
  {
    name: 'get_node_variable_bindings',
    description: 'Get bound/inferred variables and resolved modes for a node',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'export_json',
    description: 'Export a node as JSON_REST_V1 (same format as Figma REST API)',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'to_html',
    description: 'Convert a Figma node to pre-HTML with inline CSS for quick implementation',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Node ID to convert' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'to_html_page',
    description: 'Convert an entire Figma page to HTML document with inline CSS',
    inputSchema: { type: 'object', properties: { page: { type: 'string', description: 'Page name (omit for current page)' }, fileKey: { type: 'string' } } },
  },
  {
    name: 'get_text_segments',
    description: 'Get rich text segments with per-style breakdown (font, size, color, hyperlink, etc.)',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Text node ID' }, fields: { type: 'array', items: { type: 'string' } }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'detect_text_overflow',
    description: 'Find text nodes overflowing their clipped parent containers',
    inputSchema: { type: 'object', properties: { page: { type: 'string', description: 'Page name (omit for all pages)' }, fileKey: { type: 'string' } } },
  },
  {
    name: 'find_placeholders',
    description: 'Find placeholder text (lorem ipsum, {{braces}}, [brackets], "your text", etc.)',
    inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } } },
  },
  {
    name: 'check_text_consistency',
    description: 'Check text style consistency across the document',
    inputSchema: { type: 'object', properties: { group_by: { type: 'string', enum: ['page', 'fontSize', 'fontFamily'], description: 'Group results by (default: page)' }, page: { type: 'string', description: 'Filter by page name' }, fileKey: { type: 'string' } } },
  },
  {
    name: 'get_typography_tokens',
    description: 'Get all local text styles with full typography properties',
    inputSchema: { type: 'object', properties: { fileKey: { type: 'string' } } },
  },
  {
    name: 'get_frame_summary',
    description: 'Get a lightweight summary of a frame: dimensions, top-level sections, colors, fonts, asset counts, and whether variable/text tokens are defined. Use this for initial orientation before diving into detailed spec. ~200 tokens vs thousands from get_slice_spec.',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string', description: 'Frame or section node ID' }, fileKey: { type: 'string' } }, required: ['nodeId'] },
  },
  {
    name: 'get_exportable_nodes',
    description: 'Find all nodes in a section that have export settings or image fills — the quick way to discover which assets to export before calling get_screenshot or export_section_assets',
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
