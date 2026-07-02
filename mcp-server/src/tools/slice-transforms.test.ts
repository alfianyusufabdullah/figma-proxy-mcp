// Run: npx tsx src/tools/slice-transforms.test.ts
import assert from 'node:assert'
import { uniqueFileName, extractViewBox, transformNumbers, applyStylesFormat, countNodes, topSections } from './slice-transforms'

// uniqueFileName: collision-safe + idempotent
{
  const used = new Set<string>()
  assert.equal(uniqueFileName('Icon', '1:2', used, 'svg'), 'icon.svg')
  assert.equal(uniqueFileName('Icon', '3:4', used, 'svg'), 'icon-3-4.svg', 'clash appends nodeId')
  assert.equal(uniqueFileName('a b/c', '5:6', used, 'png', 'hero'), 'hero-a-b-c.png', 'prefix + sanitize + ext')
  // idempotent: same inputs into a fresh set → same name
  assert.equal(uniqueFileName('Icon', '1:2', new Set(), 'svg'), 'icon.svg')
}

// extractViewBox
assert.equal(extractViewBox('<svg viewBox="0 0 24 24"></svg>'), '0 0 24 24')
assert.equal(extractViewBox('<svg></svg>'), undefined)

// transformNumbers: round only dimension keys; leave opacity intact
{
  const out = transformNumbers({ bounds: { x: 1.4, width: 2.6 }, styles: { opacity: 0.5, paddingLeft: 3.7 } }, true, 2) as any
  assert.equal(out.bounds.x, 1)
  assert.equal(out.bounds.width, 3)
  assert.equal(out.styles.paddingLeft, 4)
  assert.equal(out.styles.opacity, 0.5, 'opacity not rounded')
  // precision mode trims everything
  const p = transformNumbers({ x: 1.23456, o: 0.98765 }, false, 2) as any
  assert.equal(p.x, 1.23)
  assert.equal(p.o, 0.99)
}

// applyStylesFormat: compact drops defaults/null/empty
{
  const node = { styles: { opacity: 1, blendMode: 'NORMAL', paddingLeft: 0, fills: [], color: '#fff', locked: false } }
  applyStylesFormat(node as any, 'compact')
  assert.deepEqual(node.styles, { color: '#fff' }, 'only non-default kept')
}

// applyStylesFormat: classes extracts repeated styles
{
  const shared = { fontSize: 16, color: '#000' }
  const root: any = { styles: { ...shared }, children: [{ styles: { ...shared } }, { styles: { unique: 1 } }] }
  const classes = applyStylesFormat(root, 'classes')!
  const ids = Object.keys(classes)
  assert.equal(ids.length, 1, 'one repeated class')
  assert.equal(root.styleRef, ids[0])
  assert.equal(root.children[0].styleRef, ids[0])
  assert.equal(root.styles, undefined, 'styles replaced by ref')
  assert.deepEqual(root.children[1].styles, { unique: 1 }, 'unique style stays inline')
}

// countNodes + topSections
{
  const root: any = { id: 'r', name: 'root', children: [{ id: 'a', name: 'A', bounds: { y: 10, height: 50 }, children: [{ id: 'a1' }] }, { id: 'b', name: 'B' }] }
  assert.equal(countNodes(root), 4)
  const secs = topSections(root)
  assert.deepEqual(secs, [{ id: 'a', name: 'A', y: 10, h: 50 }, { id: 'b', name: 'B', y: undefined, h: undefined }])
}

console.log('slice-transforms self-check: OK')
