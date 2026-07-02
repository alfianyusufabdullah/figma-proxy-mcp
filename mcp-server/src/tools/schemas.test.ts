import { toolSchemas } from './schemas.js'
import assert from 'node:assert'

// single mode still works
assert.ok(toolSchemas.set_text_content.safeParse({ nodeId: '1:2', text: 'hi' }).success)
assert.ok(toolSchemas.set_solid_fill.safeParse({ nodeId: '1:2', color: '#fff' }).success)
assert.ok(toolSchemas.set_node_properties.safeParse({ nodeId: '1:2', width: 10 }).success)

// bulk mode
assert.ok(toolSchemas.set_text_content.safeParse({ updates: [{ nodeId: '1:2', text: 'a' }, { nodeId: '1-3', text: 'b' }] }).success)
assert.ok(toolSchemas.set_solid_fill.safeParse({ updates: [{ nodeId: '1:2', color: '#ff0000', opacity: 0.5 }] }).success)
assert.ok(toolSchemas.set_node_properties.safeParse({ updates: [{ nodeId: '1:2', name: 'n' }] }).success)

// neither single nor bulk → rejected
assert.ok(!toolSchemas.set_text_content.safeParse({}).success)
assert.ok(!toolSchemas.set_solid_fill.safeParse({ color: '#fff' }).success)
assert.ok(!toolSchemas.set_node_properties.safeParse({ width: 10 }).success)

// invalid bulk entries → rejected
assert.ok(!toolSchemas.set_text_content.safeParse({ updates: [] }).success)
assert.ok(!toolSchemas.set_solid_fill.safeParse({ updates: [{ nodeId: '1:2', color: 'red' }] }).success)

// hyphen node IDs normalize to colon in bulk entries
const parsed = toolSchemas.set_text_content.parse({ updates: [{ nodeId: '10-20', text: 'x' }] })
assert.strictEqual(parsed.updates?.[0].nodeId, '10:20')

console.log('OK')
