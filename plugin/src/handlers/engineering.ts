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
    constraints: 'constraints' in node ? node.constraints : undefined,
    layoutAlign: 'layoutAlign' in node ? node.layoutAlign : undefined,
    layoutGrow: 'layoutGrow' in node ? node.layoutGrow : undefined,
    layoutPositioning: 'layoutPositioning' in node ? node.layoutPositioning : undefined,
    layoutSizingHorizontal: 'layoutSizingHorizontal' in node ? node.layoutSizingHorizontal : undefined,
    layoutSizingVertical: 'layoutSizingVertical' in node ? node.layoutSizingVertical : undefined,
    minWidth: 'minWidth' in node ? node.minWidth : undefined,
    maxWidth: 'maxWidth' in node ? node.maxWidth : undefined,
    minHeight: 'minHeight' in node ? node.minHeight : undefined,
    maxHeight: 'maxHeight' in node ? node.maxHeight : undefined,
  }
}

export async function handleGetCornerRadii(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || !('cornerRadius' in node)) throw new Error('Node has no corner radius')
  const cm = node as RectangleCornerMixin & CornerMixin
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

type Settled<T> = { status: 'fulfilled'; value: T } | { status: 'rejected' }

// ponytail: target is ES2017, which has no Promise.allSettled; this is the minimal shim
function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  return p.then(
    (value): Settled<T> => ({ status: 'fulfilled', value }),
    (): Settled<T> => ({ status: 'rejected' })
  )
}

export async function handleGetNodeStyles(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const [css, layout, responsive, effects, stroke, radius] = await Promise.all([
    settle(handleGetCss({ nodeId })),
    settle(handleGetLayoutSpec({ nodeId })),
    settle(handleGetResponsiveBehavior({ nodeId })),
    settle(handleGetEffectSpec({ nodeId })),
    settle(handleGetStrokeSpec({ nodeId })),
    settle(handleGetCornerRadii({ nodeId })),
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
