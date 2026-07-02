export async function handleGetVariables(_params: Record<string, unknown>): Promise<unknown> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    variables: c.variableIds.map((vId) => ({ id: vId, name: '', resolvedType: '' })),
  }))
}

export async function handleGetVariableTokens(_params: Record<string, unknown>): Promise<unknown> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  if (collections.length === 0) {
    return { hasTokens: false, reason: 'No variable collections defined in this file', collections: [] }
  }
  const allVars = await figma.variables.getLocalVariablesAsync()
  const varMap = new Map(allVars.map((v) => [v.id, v]))
  const resolved = collections.map((c) => ({
    id: c.id,
    name: c.name,
    defaultModeId: c.defaultModeId,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    variables: c.variableIds.map((vId) => {
      const v = varMap.get(vId)
      if (!v) return { id: vId, name: 'unknown', resolvedType: 'UNKNOWN' }
      const values: Record<string, unknown> = {}
      for (const mode of c.modes) {
        const raw = v.valuesByMode[mode.modeId]
        if (raw && typeof raw === 'object' && 'type' in raw && (raw as { type: string }).type === 'VARIABLE_ALIAS') {
          values[mode.name] = { type: 'ALIAS', id: (raw as { id: string }).id }
        } else {
          values[mode.name] = raw
        }
      }
      return {
        id: v.id, name: v.name, key: v.key, resolvedType: v.resolvedType,
        description: v.description, codeSyntax: v.codeSyntax, scopes: v.scopes,
        valuesByMode: values, hiddenFromPublishing: v.hiddenFromPublishing,
      }
    }),
  }))
  return { hasTokens: true, collections: resolved }
}

export async function handleGetNodeVariableBindings(params: Record<string, unknown>): Promise<unknown> {
  const nodeId = params.nodeId as string
  if (!nodeId) throw new Error('nodeId is required')
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) throw new Error('Node not found')
  return {
    boundVariables: ('boundVariables' in node) ? (node).boundVariables : undefined,
    inferredVariables: ('inferredVariables' in node) ? (node).inferredVariables : undefined,
    resolvedVariableModes: ('resolvedVariableModes' in node) ? (node).resolvedVariableModes : undefined,
  }
}
