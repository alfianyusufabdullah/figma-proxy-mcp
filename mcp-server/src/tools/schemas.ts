import { z } from 'zod'

const NodeIdSchema = z.string().min(1).transform(id => id.replace(/-/g, ':'))
const FileKeySchema = z.string().optional()
const DepthSchema = z.number().int().min(0).max(10).optional()
const FormatSchema = z.enum(['PNG', 'SVG', 'JPG', 'PDF']).optional()
const ScaleSchema = z.number().min(0.5).max(4).describe('Scale factor 0.5–4. PNG/JPG/PDF only; ignored for SVG.').optional()
const HexColorSchema = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
const OpacitySchema = z.number().min(0).max(1).optional()

export const toolSchemas = {
  get_document: z.object({ depth: DepthSchema, maxNodes: z.number().int().min(10).max(5000).optional(), fileKey: FileKeySchema }),
  get_selection: z.object({ fileKey: FileKeySchema }),
  get_node: z.object({ nodeId: NodeIdSchema, maxNodes: z.number().int().min(10).max(5000).optional(), excludeEmptyContainers: z.boolean().optional(), includeOnlyExportable: z.boolean().optional(), fileKey: FileKeySchema }),
  get_node_full: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_slice_spec: z.object({
    nodeId: NodeIdSchema,
    excludeEmptyContainers: z.boolean().optional(),
    includeOnlyExportable: z.boolean().optional(),
    outputDir: z.string().optional(),
    svgFilePrefix: z.string().optional(),
    omitSvgs: z.boolean().optional(),
    outputPath: z.string().optional(),
    stylesFormat: z.enum(['full', 'compact', 'classes']).optional(),
    round: z.boolean().optional(),
    precision: z.number().int().min(0).max(6).optional(),
    fileKey: FileKeySchema,
  }),
  slice_bundle: z.object({ nodeId: NodeIdSchema, outputDir: z.string(), scale: ScaleSchema, fileKey: FileKeySchema }),
  get_styles: z.object({ fileKey: FileKeySchema }),
  get_metadata: z.object({ fileKey: FileKeySchema }),
  get_design_context: z.object({ nodeIds: z.array(NodeIdSchema).optional(), depth: DepthSchema, maxNodes: z.number().int().min(10).max(5000).optional(), fileKey: FileKeySchema }),
  get_variables: z.object({ fileKey: FileKeySchema }),
  get_screenshot: z.object({ nodeIds: z.array(NodeIdSchema).optional(), nodeId: NodeIdSchema.optional(), format: FormatSchema, scale: ScaleSchema, outputPath: z.string().optional(), outputDir: z.string().optional(), fileKey: FileKeySchema }),
  get_image: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_svg: z.object({ nodeIds: z.array(NodeIdSchema).optional(), nodeId: NodeIdSchema.optional(), outputPath: z.string().optional(), outputDir: z.string().optional(), fileKey: FileKeySchema }),
  get_css: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_fonts: z.object({ fileKey: FileKeySchema }),
  get_colors: z.object({ fileKey: FileKeySchema }),
  find_text_nodes: z.object({ keyword: z.string().optional(), regex: z.string().optional(), fileKey: FileKeySchema }),
  get_text_content: z.object({ nodeId: NodeIdSchema.optional(), page: z.string().optional(), fileKey: FileKeySchema }),
  set_text_content: z.object({
    nodeId: NodeIdSchema.optional(),
    text: z.string().optional(),
    updates: z.array(z.object({ nodeId: NodeIdSchema, text: z.string() })).min(1).optional(),
    fileKey: FileKeySchema,
  }).refine(v => v.updates !== undefined || (v.nodeId !== undefined && v.text !== undefined), { message: 'Provide nodeId + text, or updates[] for bulk' }),
  set_node_visibility: z.object({ nodeIds: z.array(NodeIdSchema), visible: z.boolean(), fileKey: FileKeySchema }),
  set_solid_fill: z.object({
    nodeId: NodeIdSchema.optional(),
    color: HexColorSchema.optional(),
    opacity: OpacitySchema,
    updates: z.array(z.object({ nodeId: NodeIdSchema, color: HexColorSchema, opacity: OpacitySchema })).min(1).optional(),
    fileKey: FileKeySchema,
  }).refine(v => v.updates !== undefined || (v.nodeId !== undefined && v.color !== undefined), { message: 'Provide nodeId + color, or updates[] for bulk' }),
  create_text: z.object({ text: z.string(), x: z.number().optional(), y: z.number().optional(), fontSize: z.number().optional(), parentId: NodeIdSchema.optional(), fileKey: FileKeySchema }),
  set_node_properties: z.object({
    nodeId: NodeIdSchema.optional(),
    name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional(), opacity: OpacitySchema,
    updates: z.array(z.object({ nodeId: NodeIdSchema, name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional(), opacity: OpacitySchema })).min(1).optional(),
    fileKey: FileKeySchema,
  }).refine(v => v.updates !== undefined || v.nodeId !== undefined, { message: 'Provide nodeId, or updates[] for bulk' }),
  get_layout_spec: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_responsive_behavior: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_corner_radii: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_stroke_spec: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_effect_spec: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_component_properties: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_instance_overrides: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_variable_tokens: z.object({ fileKey: FileKeySchema }),
  get_node_variable_bindings: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  export_json: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  to_html: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  to_html_page: z.object({ page: z.string().optional(), fileKey: FileKeySchema }),
  get_text_segments: z.object({ nodeId: NodeIdSchema, fields: z.array(z.string()).optional(), fileKey: FileKeySchema }),
  detect_text_overflow: z.object({ page: z.string().optional(), fileKey: FileKeySchema }),
  find_placeholders: z.object({ fileKey: FileKeySchema }),
  check_text_consistency: z.object({ group_by: z.string().optional(), page: z.string().optional(), fileKey: FileKeySchema }),
  get_typography_tokens: z.object({ fileKey: FileKeySchema }),
  get_frame_summary: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_exportable_nodes: z.object({ nodeId: NodeIdSchema.optional(), fileKey: FileKeySchema }),
  export_section_assets: z.object({ nodeId: NodeIdSchema, outputDir: z.string().optional(), format: FormatSchema, scale: ScaleSchema, prefix: z.string().optional(), fileKey: FileKeySchema }),
}
