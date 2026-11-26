import { describe, expect, it } from 'vitest'
import { around, whole } from './Graph'

// The graph's one rule: an arrow goes from a part to what it builds, and it points right. In a window of any shape,
// and in every node's own graph, with no exception.
const left = (v: ReturnType<typeof whole>) => v.links.filter(l => v.at.get(l.target.id)![0] - v.at.get(l.source.id)![0] < 40).map(l => l.source.id + '→' + l.target.id)

describe('graph', () => {
  it('every arrow of the whole graph points right, whatever the shape of the window', () => {
    for (let aspect = 0.5; aspect <= 3; aspect += 0.05) {
      const v = whole(aspect)
      expect(v.links.length).toBeGreaterThan(1000)
      expect(left(v), `window ${aspect.toFixed(2)} times as wide as tall`).toEqual([])
    }
  })
  it('no two nodes of the whole graph share a place', () => {
    for (const aspect of [0.5, 0.9, 1.6, 3]) {
      const v = whole(aspect)
      expect(new Set([...v.at.values()].map(p => p.join())).size).toBe(v.nodes.length)
    }
  })
  it('every arrow of every node\'s own graph points right', () => {
    for (const n of whole(1).nodes) expect(left(around(n.id)), `the graph of ${n.id}`).toEqual([])
  })
})
