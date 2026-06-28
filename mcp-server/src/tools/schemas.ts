import { z } from 'zod'

const NodeIdSchema = z.string().min(1)
const FileKeySchema = z.string().optional()
const DepthSchema = z.number().int().min(0).max(10).optional()
const FormatSchema = z.enum(['PNG', 'SVG', 'JPG', 'PDF']).optional()
const ScaleSchema = z.number().min(0.5).max(4).optional()

export const toolSchemas = {
  get_document: z.object({ depth: DepthSchema, maxNodes: z.number().int().min(10).max(5000).optional(), fileKey: FileKeySchema }),
  get_selection: z.object({ fileKey: FileKeySchema }),
  get_node: z.object({ nodeId: NodeIdSchema, maxNodes: z.number().int().min(10).max(5000).optional(), fileKey: FileKeySchema }),
  get_node_full: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_slice_spec: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_styles: z.object({ fileKey: FileKeySchema }),
  get_metadata: z.object({ fileKey: FileKeySchema }),
  get_design_context: z.object({ nodeIds: z.array(NodeIdSchema).optional(), depth: DepthSchema, maxNodes: z.number().int().min(10).max(5000).optional(), fileKey: FileKeySchema }),
  get_variables: z.object({ fileKey: FileKeySchema }),
  get_screenshot: z.object({ nodeIds: z.array(NodeIdSchema).optional(), nodeId: NodeIdSchema.optional(), format: FormatSchema, scale: ScaleSchema, fileKey: FileKeySchema }),
  get_image: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_svg: z.object({ nodeIds: z.array(NodeIdSchema).optional(), nodeId: NodeIdSchema.optional(), fileKey: FileKeySchema }),
  get_css: z.object({ nodeId: NodeIdSchema, fileKey: FileKeySchema }),
  get_fonts: z.object({ fileKey: FileKeySchema }),
  get_colors: z.object({ fileKey: FileKeySchema }),
  find_text_nodes: z.object({ keyword: z.string().optional(), regex: z.string().optional(), fileKey: FileKeySchema }),
  get_text_content: z.object({ page: z.string().optional(), fileKey: FileKeySchema }),
  set_text_content: z.object({ nodeId: NodeIdSchema, text: z.string(), fileKey: FileKeySchema }),
  set_node_visibility: z.object({ nodeIds: z.array(NodeIdSchema), visible: z.boolean(), fileKey: FileKeySchema }),
  set_solid_fill: z.object({ nodeId: NodeIdSchema, color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/), opacity: z.number().min(0).max(1).optional(), fileKey: FileKeySchema }),
  create_text: z.object({ text: z.string(), x: z.number().optional(), y: z.number().optional(), fontSize: z.number().optional(), parentId: NodeIdSchema.optional(), fileKey: FileKeySchema }),
  set_node_properties: z.object({ nodeId: NodeIdSchema, name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional(), opacity: z.number().min(0).max(1).optional(), fileKey: FileKeySchema }),
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
}
