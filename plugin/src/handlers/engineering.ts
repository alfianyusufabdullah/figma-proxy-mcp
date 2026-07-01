import { serializePaints, serializeEffects } from '../serializer'
import { handleGetCss } from './assets'

export async function handleGetLayoutSpec(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error('Node not found')
  if (!('layoutMode' in node)) throw new Error('Node has no auto-layout')
  const f = node as FrameNode
  return {
    layoutMode: f.layoutMode,
    itemSpacing: f.itemSpacing,
    counterAxisSpacing: f.counterAxisSpacing,
    padding: { top: f.paddingTop, right: f.paddingRight, bottom: f.paddingBottom, left: f.paddingLeft },
    primaryAxisAlignItems: f.primaryAxisAlignItems,
    counterAxisAlignItems: f.counterAxisAlignItems,
    primaryAxisSizingMode: f.primaryAxisSizingMode,
    counterAxisSizingMode: f.counterAxisSizingMode,
    layoutWrap: f.layoutWrap,
    strokesIncludedInLayout: f.strokesIncludedInLayout,
    counterAxisAlignContent: 'counterAxisAlignContent' in f ? (f as unknown as Record<string, unknown>).counterAxisAlignContent : undefined,
  }
}

export async function handleGetResponsiveBehavior(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error('Node not found')
  return {
    constraints: 'constraints' in node ? (node as ConstraintsMixin).constraints : undefined,
    layoutAlign: 'layoutAlign' in node ? (node as SceneNode).layoutAlign : undefined,
    layoutGrow: 'layoutGrow' in node ? (node as SceneNode).layoutGrow : undefined,
    layoutPositioning: 'layoutPositioning' in node ? (node as SceneNode).layoutPositioning : undefined,
    layoutSizingHorizontal: 'layoutSizingHorizontal' in node ? (node as SceneNode).layoutSizingHorizontal : undefined,
    layoutSizingVertical: 'layoutSizingVertical' in node ? (node as SceneNode).layoutSizingVertical : undefined,
    minWidth: 'minWidth' in node ? (node as SceneNode).minWidth : undefined,
    maxWidth: 'maxWidth' in node ? (node as SceneNode).maxWidth : undefined,
    minHeight: 'minHeight' in node ? (node as SceneNode).minHeight : undefined,
    maxHeight: 'maxHeight' in node ? (node as SceneNode).maxHeight : undefined,
  }
}

export async function handleGetCornerRadii(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || !('cornerRadius' in node)) throw new Error('Node has no corner radius')
  const cm = node as RectangleCornerMixin
  const tl = cm.topLeftRadius, tr = cm.topRightRadius, bl = cm.bottomLeftRadius, br = cm.bottomRightRadius
  const allSame = tl === tr && tr === bl && bl === br
  return {
    cornerRadius: allSame ? tl : { topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br },
    cornerSmoothing: cm.cornerSmoothing,
  }
}

export async function handleGetStrokeSpec(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || !('strokes' in node)) throw new Error('Node has no strokes')
  const gm = node as GeometryMixin
  const hasComplex = 'strokeTopWeight' in gm
  return {
    strokes: serializePaints(gm.strokes),
    strokeAlign: gm.strokeAlign,
    strokeWeight: hasComplex ? {
      all: gm.strokeWeight,
      top: (gm as unknown as Record<string, number>).strokeTopWeight,
      bottom: (gm as unknown as Record<string, number>).strokeBottomWeight,
      left: (gm as unknown as Record<string, number>).strokeLeftWeight,
      right: (gm as unknown as Record<string, number>).strokeRightWeight,
    } : gm.strokeWeight,
    dashPattern: 'dashPattern' in gm ? gm.dashPattern : undefined,
    strokeCap: 'strokeCap' in gm ? gm.strokeCap : undefined,
    strokeJoin: 'strokeJoin' in gm ? gm.strokeJoin : undefined,
    strokeMiterLimit: 'strokeMiterLimit' in gm ? gm.strokeMiterLimit : undefined,
    strokeStyleId: gm.strokeStyleId || undefined,
  }
}

export async function handleGetEffectSpec(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || !('effects' in node)) throw new Error('Node has no effects')
  return {
    effects: serializeEffects((node as BlendMixin).effects),
    effectStyleId: (node as BlendMixin).effectStyleId || undefined,
  }
}

export async function handleGetNodeStyles(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const [css, layout, responsive, effects, stroke, radius] = await Promise.allSettled([
    handleGetCss({ nodeId }),
    handleGetLayoutSpec({ nodeId }),
    handleGetResponsiveBehavior({ nodeId }),
    handleGetEffectSpec({ nodeId }),
    handleGetStrokeSpec({ nodeId }),
    handleGetCornerRadii({ nodeId }),
  ])
  return {
    nodeId,
    css: css.status === 'fulfilled' ? css.value : null,
    layout: layout.status === 'fulfilled' ? layout.value : null,
    responsive: responsive.status === 'fulfilled' ? responsive.value : null,
    effects: effects.status === 'fulfilled' ? effects.value : null,
    stroke: stroke.status === 'fulfilled' ? stroke.value : null,
    radius: radius.status === 'fulfilled' ? radius.value : null,
  }
}
