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
        nodeId: { type: 'string', description: 'Node ID (e.g. 4029:12345)' },
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
    description: 'Dump all text content from a specific page or all pages',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', description: 'Page name (omit for all pages)' },
        fileKey: { type: 'string', description: 'File key (omit if single file)' },
      },
    },
  },
  {
    name: 'get_screenshot',
    description: 'Export nodes as PNG/SVG images (base64-encoded)',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to export (omit for current selection)' },
        nodeId: { type: 'string', description: 'Single node ID to export' },
        format: { type: 'string', enum: ['PNG', 'SVG', 'JPG', 'PDF'], description: 'Export format (default PNG)' },
        scale: { type: 'number', description: 'Scale factor (default 2)' },
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
]
