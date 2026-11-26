import { describe, expect, it } from 'vitest'
import { around, whole } from './Graph'

// The graph's one rule: an arrow goes from a part to what it builds, and it points right. In a window of any shape,
// and in every node's own graph, with no exception.
const left = (v: ReturnType<typeof whole>) => v.links.filter(l => v.at.get(l.target.id)![0] - v.at.get(l.source.id)![0] < 40).map(l => l.source.id + '→' + l.target.id)

/** Points along an arrow as a node's own graph writes it: M x,y, then curves (C) and level runs (H). */
const along = (d: string) => {
  const pts: [number, number][] = []
  let x = 0, y = 0
  for (const [, cmd, rest] of d.matchAll(/([MCH])([^MCH]*)/g)) {
    const v = rest.split(/[ ,]+/).filter(Boolean).map(Number)
    if (cmd === 'M') { [x, y] = v; pts.push([x, y]); continue }
    const [x1, y1, x2, y2, x3, y3] = cmd === 'H' ? [x, y, v[0], y, v[0], y] : v
    const n = Math.max(2, Math.ceil((Math.abs(x3 - x) + Math.abs(y3 - y)) / 4))
    for (let i = 1; i <= n; i++) { const s = i / n, u = 1 - s; pts.push([u * u * u * x + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * x3, u * u * u * y + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * y3]) }
    x = x3; y = y3
  }
  return pts
}
const HALF = 14  // half a tile's side

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
  it('every arrow of every node\'s own graph points right, in a wide window and a narrow one', () => {
    for (const [w, h] of [[1440, 790], [761, 723], [390, 600]]) for (const n of whole(1).nodes) expect(left(around(n.id, w, h)), `the graph of ${n.id} in ${w} by ${h}`).toEqual([])
  })
  it('in a node\'s own graph no arrow runs through a tile that is not its own, nor anywhere to the left', () => {
    for (const [w, h] of [[1440, 790], [761, 723], [390, 600]]) for (const n of whole(1).nodes) {
      const v = around(n.id, w, h), tiles = [...v.nodes, ...v.leaves!].map(t => [t.id, ...v.at.get(t.id)!] as const)
      v.links.forEach((l, i) => {
        const pts = along(v.paths![i]), say = `${l.source.id}→${l.target.id} in the graph of ${n.id}, ${w} by ${h}`
        expect(pts.every((p, k) => k === 0 || p[0] >= pts[k - 1][0] - 1e-6), say + ' goes left').toBe(true)
        expect(pts[0][0], say).toBeCloseTo(v.at.get(l.source.id)![0] + HALF + 1, 0)
        expect(pts[pts.length - 1], say).toEqual([v.at.get(l.target.id)![0] - HALF - 5, v.at.get(l.target.id)![1]])
        const xs = [pts[0][0], pts[pts.length - 1][0]]
        for (const [id, x, y] of tiles) if (id !== l.source.id && id !== l.target.id && x > xs[0] - HALF && x < xs[1] + HALF)
          expect(pts.some(p => Math.abs(p[0] - x) < HALF && Math.abs(p[1] - y) < HALF), say + ' runs through ' + id).toBe(false)
      })
    }
  })
  it('a node\'s own graph has the kanji it builds that nothing is built from, each in a place of its own', () => {
    for (const n of whole(1).nodes) {
      const v = around(n.id, 761, 723), all = [...v.nodes, ...v.leaves!]
      expect(v.leaves!.map(l => l.id), `the graph of ${n.id}`).toEqual(n.ends)
      expect(new Set(all.map(a => v.at.get(a.id)!.join())).size, `the graph of ${n.id}`).toBe(all.length)
    }
  })
})
