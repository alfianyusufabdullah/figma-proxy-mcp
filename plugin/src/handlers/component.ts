export async function handleGetComponentProperties(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error('Node not found')
  const cp: Record<string, unknown> = {}
  if ('componentPropertyDefinitions' in node) cp.definitions = node.componentPropertyDefinitions
  if ('componentProperties' in node) cp.values = (node).componentProperties
  if ('variantProperties' in node) cp.variantProperties = (node as ComponentNode).variantProperties
  if ('key' in node) cp.key = (node as ComponentNode).key
  if ('remote' in node) cp.remote = (node as ComponentNode).remote
  if ('description' in node) cp.description = (node as ComponentNode).description
  if ('devStatus' in node) cp.devStatus = (node as ComponentNode).devStatus
  return cp
}

export async function handleGetInstanceOverrides(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || node.type !== 'INSTANCE') throw new Error('Node is not an instance')
  const inst = node
  const mainComp = await inst.getMainComponentAsync()
  return {
    overrides: inst.overrides.map((o) => ({ id: o.id, overriddenFields: o.overriddenFields })),
    scaleFactor: inst.scaleFactor,
    isExposedInstance: inst.isExposedInstance,
    exposedInstances: inst.exposedInstances.map((e) => ({ id: e.id, name: e.name })),
    mainComponent: mainComp ? { id: mainComp.id, name: mainComp.name, key: mainComp.key } : null,
  }
}
