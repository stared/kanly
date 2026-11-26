import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { COMP, KANJI, POS, gloss } from './data'
import type { Store } from './srs'
import { standing } from './levels'
import { STROKES, treeOf } from './Card'

/*
What kanji are built from, as a graph. A node is anything used as a direct part of something else; an arrow goes
from a part to what it builds (二 → 云 → 雲). A kanji nothing is built from is not drawn: a node counts those it
builds directly ("+23"). The place of the part in the whole (Tree.pos) is on the arrow, shown on hover.

One rule, with no exception and in a window of any shape: every arrow points right. So a node stands by how many
steps it is from the basic parts (those nothing here is a part of): the basic parts on the left, then what is built
from them alone, then what needs one of those, and so on. A node is one step past the furthest of its parts, so
each of its parts is in a group to its left. Inside a group the nodes are in the order they are learned, down a
column and then down the next.

With 845 nodes and 1165 arrows, every arrow drawn at once is a hairball (口 alone is in 62 other nodes), so the whole
graph shows the nodes and, under the pointer, the arrows of one node. Clicking a node shows only what it is built
from and what it builds, with every arrow, and there the kanji it builds that nothing is built from are drawn too. Before this each node hung under one of its parts, the rarest, in trees
packed by size: the arrows to its other parts then pointed wherever those trees happened to lie, a quarter of them
left, and which ones changed with the window.
*/
type N = { id: string; ends: string[] }
type L = { source: N; target: N; pos: string[]; sound: boolean }
type P = Map<string, [number, number]>
/** quiet: arrows and counts only for the node under the pointer; leaves: kanji drawn that are not nodes (nothing is
 * built from them), in a node's own graph; paths: where each arrow runs, where that is not straight from tile to tile */
export type View = { nodes: N[]; links: L[]; at: P; box: [number, number, number, number]; quiet?: boolean; leaves?: N[]; paths?: string[] }

const PLACE: Record<string, string> = {
  left: 'left', right: 'right', top: 'top', bottom: 'bottom', middle: 'middle', inside: 'inside',
  sides: 'left and right', ends: 'top and bottom',
  '⿴': 'frame, all around', '⿵': 'frame, open below', '⿶': 'frame, open above', '⿷': 'frame, open to the right',
  '⿸': 'frame, top and left', '⿹': 'frame, top and right', '⿺': 'frame, left and bottom', '⿻': 'merged into one shape',
}
const S = 14            // half a node's side: a square tile, as a kanji is everywhere else
// a node's own graph: between two columns of one step (room for a count, and for an arrow coming down beside it), between rows, between two steps
const OX = 80, OY = 38, OSTEP = 170
const RAMP = 30  // how far an arrow runs while it comes down from between two rows to a tile, or goes up from one
const PX = 38, PY = 34, GROUP = 48  // the whole graph: the grid's steps, and the gap between two groups more
const uses = (id: string) => COMP[id]?.usedIn.length ?? 1

const boxOf = (at: P, [l, t, r, b]: View['box']): View['box'] => {
  const xs = [...at.values()].map(p => p[0]), ys = [...at.values()].map(p => p[1])
  return [Math.min(...xs) - l, Math.min(...ys) - t, Math.max(...xs) + r, Math.max(...ys) + b]
}

type Part = { part: N; pos: string[]; sound: boolean }
/** leaf: a kanji nothing is built from, with its parts that are nodes */
let G: { nodes: Map<string, N>; links: L[]; into: Map<string, L[]>; out: Map<string, L[]>; leaf: Map<string, Part[]> } | undefined
function graph() {
  if (G) return G
  const parts = new Map<string, Map<string, { pos: Set<string>; sound: boolean }>>()  // whole → part → places
  for (const el of Object.keys(COMP)) {
    for (const k of treeOf(el)?.kids ?? []) {
      if (STROKES.has(k.el) || k.el === el) continue
      const m = parts.get(el) ?? parts.set(el, new Map()).get(el)!
      const e = m.get(k.el) ?? m.set(k.el, { pos: new Set(), sound: false }).get(k.el)!
      if (k.pos) e.pos.add(k.pos)
      if (k.phon) e.sound = true
    }
  }
  const ids = new Set([...parts.values()].flatMap(m => [...m.keys()]))
  const nodes = new Map<string, N>([...ids].map(id => [id, { id, ends: [] }]))
  const links: L[] = [], into = new Map<string, L[]>(), out = new Map<string, L[]>(), leaf = new Map<string, Part[]>()
  for (const [whole, m] of parts) {
    for (const [part, e] of m) {
      if (!nodes.has(whole)) {
        nodes.get(part)!.ends.push(whole)
        leaf.set(whole, [...(leaf.get(whole) ?? []), { part: nodes.get(part)!, pos: [...e.pos], sound: e.sound }])
        continue
      }
      const l = { source: nodes.get(part)!, target: nodes.get(whole)!, pos: [...e.pos], sound: e.sound }
      links.push(l)
      into.set(whole, [...(into.get(whole) ?? []), l])
      out.set(part, [...(out.get(part) ?? []), l])
    }
  }
  return G = { nodes, links, into, out, leaf }
}

const WHOLE = new Map<string, View>()
/** Everything, in groups by steps from the basic parts, each group in the order it is learned (down a column, then
 * the next): as many rows as show it largest in a window of this shape. No arrow is drawn until a node is pointed at. */
export function whole(aspect: number): View {
  const key = aspect.toFixed(2)
  if (WHOLE.has(key)) return WHOLE.get(key)!
  const { nodes, links, into } = graph()
  const steps = new Map<string, number>()
  const step = (id: string): number => steps.get(id) ?? steps.set(id, into.has(id) ? 1 + Math.max(...into.get(id)!.map(l => step(l.source.id))) : 0).get(id)!
  const groups: string[][] = []
  for (const id of nodes.keys()) (groups[step(id)] ??= []).push(id)
  for (const g of groups) g.sort((a, b) => (POS.get(a) ?? 1e9) - (POS.get(b) ?? 1e9))
  const pad: View['box'] = [S + 14, S + 14, S + 34, S + 14]
  const lay = (rows: number) => {
    const at: P = new Map()
    let x = 0
    for (const g of groups) {
      g.forEach((id, i) => at.set(id, [x + Math.floor(i / rows) * PX, (i % rows) * PY]))
      x += Math.ceil(g.length / rows) * PX + GROUP
    }
    const box = boxOf(at, pad)
    return { at, box, size: Math.min(aspect / (box[2] - box[0]), 1 / (box[3] - box[1])) }
  }
  let best = lay(1)
  for (let rows = 2; rows <= Math.max(...groups.map(g => g.length)); rows++) { const l = lay(rows); if (l.size > best.size) best = l }
  const view: View = { nodes: [...nodes.values()], links, at: best.at, box: best.box, quiet: true }
  WHOLE.set(key, view)
  return view
}

/** One node with all it is built from (to its left) and all it builds (to its right), every arrow among them: in steps
 * by the longest chain to the node, so that every arrow points right. The kanji it builds that nothing is built from
 * stand there as well, one step past the furthest of their parts shown.
 *
 * A step too long for the window (w by h) in one column takes several: as few as show the whole graph at its full
 * size, or, if none does, as many as show it largest. Its order and its arrows are such that arrows cross little and
 * none runs through a tile that is not its own:
 * - what builds something shown stands at the right edge of its step, next to what it builds, in the middle rows;
 * - the rest, where all have the same parts here (the node alone): as learned, down a column and then the next;
 *   else row by row, each beside its parts;
 * - the order is settled in three sweeps from the node outwards, each item by where its neighbours then are;
 * - an arrow goes straight to a tile in the first column of a step. To one in a later column it runs level between
 *   two rows, in a street, and comes off it into its tile by a ramp: the street beside the tile's row on the side the
 *   arrow comes from, so that it never climbs past a tile to drop back onto it. Out of a tile that is not at the
 *   right edge it leaves by the street on the side it is headed for; past a step in between it takes the street
 *   nearest its way. Arrows along one street run as one line.
 * Before, such a step was in learning order and its arrows went straight to each tile: over all the own graphs 3454
 * times through a tile not theirs and 1487 crossings, against none and 74. */
export function around(id: string, w = 1200, h = 800): View {
  const { nodes, links, into, out, leaf } = graph()
  const col = new Map<string, number>([[id, 0]])
  // columns by the longest chain to the node, so every arrow points right
  const reach = (n: string, next: Map<string, L[]>, end: 'source' | 'target', seen = new Set<string>()) => {
    for (const l of next.get(n) ?? []) if (!seen.has(l[end].id)) { seen.add(l[end].id); reach(l[end].id, next, end, seen) }
    return seen
  }
  const before = reach(id, into, 'source'), after = reach(id, out, 'target')
  const dist = (n: string, toward: Map<string, L[]>, end: 'source' | 'target', among: Set<string>, sign: number): number => {
    if (n === id) return 0
    if (!col.has(n)) {
      col.set(n, 0)
      col.set(n, sign * (1 + Math.max(0, ...(toward.get(n) ?? []).filter(l => among.has(l[end].id) || l[end].id === id).map(l => Math.abs(dist(l[end].id, toward, end, among, sign))))))
    }
    return col.get(n)!
  }
  before.forEach(n => dist(n, out, 'target', before, -1))
  after.forEach(n => dist(n, into, 'source', after, 1))
  const shown = links.filter(l => col.has(l.source.id) && col.has(l.target.id))
  const inner = [...col.keys()].map(n => nodes.get(n)!)
  const leaves: N[] = nodes.get(id)!.ends.map(e => ({ id: e, ends: [] }))
  for (const n of leaves) {
    const from = leaf.get(n.id)!.filter(p => col.has(p.part.id))
    col.set(n.id, 1 + Math.max(...from.map(p => col.get(p.part.id)!)))
    for (const p of from) shown.push({ source: p.part, target: n, pos: p.pos, sound: p.sound })
  }
  const cols = new Map<number, string[]>()
  for (const [n, c] of col) cols.set(c, [...(cols.get(c) ?? []), n])
  const steps = [...cols.keys()].sort((a, b) => a - b)
  const pad: View['box'] = [S + 22, S + 22, S + 52, S + 22]
  const lead = new Set(shown.map(l => l.source.id))  // what builds something shown
  const beside = new Map<string, string[]>(), parts = new Map<string, string[]>()  // neighbours among those shown; parts among them
  const add = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v])
  for (const l of shown) { add(beside, l.source.id, l.target.id); add(beside, l.target.id, l.source.id); add(parts, l.target.id, l.source.id) }
  const pos = (n: string) => POS.get(n) ?? 1e9
  type Cell = { c: number; j: number; n: number; x: number; y: number }  // its step, its column there, the step's columns
  const f1 = (v: number) => +v.toFixed(1)
  const lay = (rows: number) => {
    // where each step starts: the node at 0, what it builds step by step to the right, its parts to the left
    const ncol = (c: number) => Math.ceil(cols.get(c)!.length / rows), wide = (c: number) => (ncol(c) - 1) * OX
    const x0 = new Map<number, number>([[0, 0]])
    for (const c of steps.filter(c => c > 0)) x0.set(c, x0.get(c - 1)! + wide(c - 1) + OSTEP)
    for (const c of steps.filter(c => c < 0).reverse()) x0.set(c, x0.get(c + 1)! - OSTEP - wide(c))
    const cell = new Map<string, Cell>([[id, { c: 0, j: 0, n: 1, x: 0, y: 0 }]])
    for (let sweep = 0; sweep < 3; sweep++) for (const c of steps.filter(c => c).sort((a, b) => Math.abs(a) - Math.abs(b))) {
      const all = cols.get(c)!, tall = Math.min(rows, all.length), nc = ncol(c)
      const mean = (n: string) => { const ys = beside.get(n)!.flatMap(m => cell.get(m)?.y ?? []); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0 }
      const order = all.map(n => [n, mean(n)] as const).sort((a, b) => a[1] - b[1] || pos(a[0]) - pos(b[0])).map(o => o[0])  // before any of them moves
      const put = (n: string, j: number, row: number) => cell.set(n, { c, j, n: nc, x: x0.get(c)! + j * OX, y: (row - (tall - 1) / 2) * OY })
      if (nc === 1) { order.forEach((n, i) => put(n, 0, i)); continue }
      const L = order.filter(n => lead.has(n)), T = order.filter(n => !lead.has(n))
      const same = T.every(n => parts.get(n)?.join() === parts.get(T[0])?.join())
      const taken = new Set<string>(), free: [number, number][] = []
      for (let i = 0, j = nc - 1; i < L.length; i += rows, j--) {
        const here = L.slice(i, i + rows), top = Math.floor((rows - here.length) / 2)
        here.forEach((n, k) => { put(n, j, top + k); taken.add(j + ',' + (top + k)) })
      }
      if (same) { for (let j = 0; j < nc; j++) for (let row = 0; row < rows; row++) if (!taken.has(j + ',' + row)) free.push([j, row]) }
      else for (let row = 0; row < rows; row++) for (let j = 0; j < nc; j++) if (!taken.has(j + ',' + row)) free.push([j, row])
      // row by row there may be more cells than items: the rows taken are the middle ones
      const skip = same ? 0 : Math.floor((free.length - T.length) / 2 / nc) * nc
      ;(same ? [...T].sort((a, b) => pos(a) - pos(b)) : T).forEach((n, k) => put(n, ...free[k + skip]))
    }
    const at: P = new Map([...cell].map(([n, c]) => [n, [c.x, c.y]]))
    const left = (c: number) => x0.get(c)! - S - 24, right = (c: number) => x0.get(c)! + wide(c) + S + 24
    const paths = shown.map(l => {
      const s = cell.get(l.source.id)!, t = cell.get(l.target.id)!
      let x = s.x + S + 1, y = s.y, d = `M${x},${f1(y)}`
      const bend = (x1: number, y1: number) => { const m = f1((x + x1) / 2); d += `C${m},${f1(y)} ${m},${f1(y1)} ${f1(x1)},${f1(y1)}`; x = x1; y = y1 }
      const level = (x1: number) => { if (x1 > x) { d += `H${f1(x1)}`; x = x1 } }
      if (s.n > 1 && s.j < s.n - 1) { bend(x + RAMP, s.y + (t.y < s.y ? -1 : 1) * OY / 2); level(right(s.c)) }
      for (let c = s.c + 1; c < t.c; c++) {
        const tall = Math.min(rows, cols.get(c)!.length), top = -(tall - 1) / 2 * OY - OY / 2
        const want = y + (t.y - y) * (x0.get(c)! - x) / (t.x - x)
        bend(left(c), top + Math.max(0, Math.min(tall, Math.round((want - top) / OY))) * OY); level(right(c))
      }
      if (t.j > 0) { bend(left(t.c), t.y + (y > t.y ? 1 : -1) * OY / 2); level(t.x - S - 8 - RAMP); bend(t.x - S - 8, t.y) } else bend(t.x - S - 8, t.y)
      return d + `H${f1(t.x - S - 5)}`
    })
    const box = boxOf(at, pad)
    return { at, paths, box, k: Math.min(w / (box[2] - box[0]), h / (box[3] - box[1])) }
  }
  const most = Math.max(...[...cols.values()].map(c => c.length))
  let best = lay(most)
  for (let rows = most - 1; rows >= 1 && best.k < 1; rows--) { const l = lay(rows); if (l.k > best.k) best = l }
  return { nodes: inner, leaves, links: shown, at: best.at, box: best.box, paths: best.paths }
}

const glyph = (el: string) => el.startsWith('CDP') ? '◌' : el

const ALL = () => [...graph().nodes.values()]

/** f(0) at once, then f of 0 → 1, eased, a frame at a time over ms; returns the way to stop it. */
function tween(ms: number, f: (e: number) => void) {
  const t0 = performance.now()
  f(0)
  let raf = requestAnimationFrame(function step(now) {
    const t = Math.min(1, Math.max(0, (now - t0) / ms))
    f(t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
    if (t < 1) raf = requestAnimationFrame(step)
  })
  return () => cancelAnimationFrame(raf)
}
const GLIDE = 600

// a node: a square tile with round corners. The lower right half of its edge, from corner to corner, is drawn once
// more where the reading stands otherwise than the meaning (as the border of a tile does everywhere else)
const C = 6.5, K = C * (1 - Math.SQRT1_2)
const HALF = `M${S - K},${-S + K}A${C},${C} 0 0 1 ${S},${-S + C}V${S - C}A${C},${C} 0 0 1 ${S - C},${S}H${-S + C}A${C},${C} 0 0 1 ${-S + K},${S - K}`
// in the whole graph a node answers the pointer over its whole cell of the grid: between two tiles there is no gap
// where the arrows would go out and come back
const PAD = `M${-PX / 2},${-PY / 2}h${PX}v${PY}h${-PX}z`
/** A tile: its edge says how the meaning stands; where the reading stands otherwise, the lower right half says that. */
const tile = (store: Store, id: string) => {
  const meaning = standing(store, id, 'm'), reading = standing(store, id, 'r')
  return <>
    <rect x={-S} y={-S} width={S * 2} height={S * 2} rx={C} />
    {reading !== meaning && <path className={'half ' + reading} d={HALF} />}
    <text fontSize={15} dy=".36em" textAnchor="middle">{glyph(id)}</text>
  </>
}
/** "+23": the kanji a node builds that are not nodes. Up and right of a node that arrows leave (they leave to the right). */
const count = (n: N, up: boolean, i?: number) => up
  ? <g className="ge" data-e={i}><path d={`M${S - 1},${-S + 1}l5,-5`} markerEnd="url(#arrow)" /><text x={S + 8} y={-S - 6}>+{n.ends.length}</text></g>
  : <g className="ge" data-e={i}><path d={`M${S + 1},0h7`} markerEnd="url(#arrow)" /><text x={S + 13} dy=".35em">+{n.ends.length}</text></g>

/** Every node is always drawn, so that it glides to its place when the view changes; a node the view leaves out fades
 * where it was. Arrows cannot glide, so they fade out and back in (.moving).
 * A node's place is an SVG attribute, in the graph's own units, as an arrow's path is. As a CSS transform (in px)
 * WebKit multiplied it by the page's zoom and left the arrows alone: at 120% every node sat off its arrows. So the
 * glide is done here, not by a CSS transition. */
const Scene = memo(function Scene({ view, store, hot, focus }: { view: View; store: Store; hot: string | null; focus: string | null }) {
  const { links, at, quiet, leaves, paths } = view
  const root = useRef<SVGGElement>(null)
  const drawn = useRef<P>(new Map())  // where each node is on the screen now
  const near = useMemo(() => new Set(hot ? links.filter(l => l.source.id === hot || l.target.id === hot).flatMap(l => [l.source.id, l.target.id]) : []), [hot, view])
  const fans = useMemo(() => new Set(links.map(l => l.source.id)), [view])
  const over = quiet && hot ? graph().nodes.get(hot) : undefined
  useLayoutEffect(() => {
    const els = root.current!.querySelectorAll<SVGGElement>(':scope > .gn')
    const moves = ALL().flatMap((n, i) => {
      const to = at.get(n.id) ?? drawn.current.get(n.id) ?? [0, 0], from = drawn.current.get(n.id) ?? to
      if (from[0] !== to[0] || from[1] !== to[1]) return [{ el: els[i], id: n.id, from, to }]
      drawn.current.set(n.id, to)
      return []
    })
    if (moves.length) return tween(GLIDE, e => {
      for (const { el, id, from, to } of moves) {
        const p: [number, number] = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e]
        drawn.current.set(id, p)
        el.setAttribute('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`)
      }
    })
  }, [view])
  return (
    <g ref={root} className={(hot ? 'has-hot' : '') + (quiet ? ' quiet' : '')}>
      {links.map((l, i) => {
        const touch = hot !== null && (l.source.id === hot || l.target.id === hot)
        if (quiet && !touch) return null
        // every arrow points right: a curve that leaves a tile's right side level and arrives level at a left side
        const [sx, sy] = at.get(l.source.id)!, [tx, ty] = at.get(l.target.id)!
        const a = sx + S + 1, b = tx - S - 5, m = (a + b) / 2
        const d = paths?.[i] ?? `M${a},${sy.toFixed(1)}C${m.toFixed(1)},${sy.toFixed(1)} ${m.toFixed(1)},${ty.toFixed(1)} ${b - 3},${ty.toFixed(1)}L${b},${ty.toFixed(1)}`
        return <g key={i} data-l={i} className={'gl' + (touch ? ' hot' : '')}><path d={d} markerEnd="url(#arrow)" /><path className="hit" d={d} /></g>
      })}
      {ALL().map((n, i) => {
        const here = at.get(n.id)
        const [x, y] = here ?? drawn.current.get(n.id) ?? [0, 0]
        return (
          <g key={n.id} data-n={i} className={'gn ' + standing(store, n.id, 'm') + (KANJI[n.id] ? '' : ' part') + (here ? '' : ' gone') + (n.id === hot || near.has(n.id) ? ' hot' : '') + (n.id === focus ? ' focus' : '')} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>
            {quiet && <path className="pad" d={PAD} />}
            {tile(store, n.id)}
            {/* not of the node whose graph this is: what it would count is drawn */}
            {!quiet && n.ends.length > 0 && n.id !== focus && count(n, fans.has(n.id), i)}
          </g>
        )
      })}
      {/* a node's own graph: the kanji it builds that are not nodes. They come with the arrows, once the nodes have arrived */}
      {leaves?.map(n => {
        const [x, y] = at.get(n.id)!
        return <g key={n.id} data-c={n.id} className={'gn leaf ' + standing(store, n.id, 'm') + (n.id === hot || near.has(n.id) ? ' hot' : '')} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>{tile(store, n.id)}</g>
      })}
      {/* the whole graph: one count, of the node under the pointer, over its neighbours */}
      {over && over.ends.length > 0 && <g className="over" transform={`translate(${at.get(over.id)![0].toFixed(1)},${at.get(over.id)![1].toFixed(1)})`}>{count(over, true)}</g>}
    </g>
  )
})

type Tip = { x: number; y: number; node?: N; link?: L; ends?: N; leaf?: string }

export function Graph({ store, open }: { store: Store; open: (el: string) => void }) {
  const [focus, setFocus] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  // the window when the tab opens (below the top bar and the graph's own), so that a graph is laid out to fill it
  const [win] = useState(() => ({ w: innerWidth, h: Math.max(200, innerHeight - 110) }))
  const view = useMemo(() => focus ? around(focus, win.w, win.h) : whole(Math.min(3, Math.max(0.5, win.w / win.h))), [focus, win])
  const { links, box } = view
  const nodes = useMemo(ALL, [])
  const [pan, setPan] = useState({ x: 0, y: 0, k: 1 })
  const [glide, setGlide] = useState(false)   // the view moves by itself (a new layout, a button), not under the hand
  const [moving, setMoving] = useState(false) // nodes are on their way: arrows wait
  const [tip, setTip] = useState<Tip | null>(null)
  // below and right of the pointer; at the graph's right and bottom edges, where it was cut off, on the other side of it
  const tipRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = tipRef.current, box = ref.current
    if (!el || !box || !tip) return
    const side = (p: number, size: number, room: number) => p + 14 + size > room - 4 ? Math.max(4, p - 10 - size) : p + 14
    el.style.left = side(tip.x, el.offsetWidth, box.clientWidth) + 'px'
    el.style.top = side(tip.y, el.offsetHeight, box.clientHeight) + 'px'
  }, [tip])
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const fingers = useRef(new Map<number, [number, number]>())
  const boxRef = useRef(box)
  boxRef.current = box

  /** Never further out than the whole graph, never past its edges: smaller than the window it sits centred. */
  const clamp = (v: { x: number; y: number; k: number }) => {
    const r = ref.current!.getBoundingClientRect(), b = boxRef.current
    const k = Math.min(4, Math.max(Math.min(1.6, r.width / (b[2] - b[0]), r.height / (b[3] - b[1])), v.k))
    const one = (p: number, size: number, lo: number, hi: number) => k * (hi - lo) <= size ? (size - k * (lo + hi)) / 2 : Math.min(-k * lo, Math.max(size - k * hi, p))
    return { k, x: one(v.x, r.width, b[0], b[2]), y: one(v.y, r.height, b[1], b[3]) }
  }
  // first all of it, as large as the window lets it be (a small graph no larger than can be read with ease)
  const start = () => setPan(clamp({ x: 0, y: 0, k: 0 }))
  const first = useRef(true)
  useLayoutEffect(() => {
    setGlide(!first.current)
    start()
    setTip(null)
    if (first.current) { first.current = false; return }
    setMoving(true)
    const t = setTimeout(() => setMoving(false), 650)
    return () => clearTimeout(t)
  }, [view])
  // the view as drawn: at once under the hand, in a glide when it moves by itself (an attribute, as a node's place is)
  const panEl = useRef<SVGGElement>(null), panNow = useRef(pan)
  useLayoutEffect(() => {
    const from = panNow.current
    const put = (v: typeof pan) => { panNow.current = v; panEl.current!.setAttribute('transform', `translate(${v.x.toFixed(2)},${v.y.toFixed(2)}) scale(${v.k.toFixed(5)})`) }
    if (!glide) return put(pan)
    return tween(GLIDE, e => put({ x: from.x + (pan.x - from.x) * e, y: from.y + (pan.y - from.y) * e, k: from.k + (pan.k - from.k) * e }))
  }, [pan, glide])
  const zoom = (f: number, cx?: number, cy?: number) => setPan(v => {
    const r = ref.current!.getBoundingClientRect()
    const px = cx ?? r.width / 2, py = cy ?? r.height / 2
    const k = clamp({ ...v, k: v.k * f }).k
    return clamp({ k, x: px - (px - v.x) * k / v.k, y: py - (py - v.y) * k / v.k })
  })
  useEffect(() => {
    const el = ref.current!
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setGlide(false)
      zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.peek')) setFocus(null) }  // with a card open, Escape closes the card
    const resize = () => setPan(clamp)
    el.addEventListener('wheel', wheel, { passive: false })
    addEventListener('keydown', esc)
    addEventListener('resize', resize)
    return () => { el.removeEventListener('wheel', wheel); removeEventListener('keydown', esc); removeEventListener('resize', resize) }
  }, [])

  const at = (e: React.MouseEvent) => {
    const t = e.target as Element
    const g = (k: string) => t.closest(`[data-${k}]`)?.getAttribute(`data-${k}`)
    const en = g('e'), n = g('n'), c = g('c'), l = g('l')
    return en != null ? { ends: nodes[+en] } : n != null ? { node: nodes[+n] } : c != null ? { leaf: c } : l != null ? { link: links[+l] } : null
  }
  const move = (e: React.PointerEvent) => {
    const f = fingers.current
    if (f.has(e.pointerId) && f.size === 2) {  // two fingers: zoom about the point between them
      const [a, b] = [...f.values()], r = ref.current!.getBoundingClientRect()
      const was = Math.hypot(a[0] - b[0], a[1] - b[1])
      f.set(e.pointerId, [e.clientX, e.clientY])
      const [c, d2] = [...f.values()], now = Math.hypot(c[0] - d2[0], c[1] - d2[1])
      if (drag.current) drag.current.moved = true
      if (was > 0) zoom(now / was, (c[0] + d2[0]) / 2 - r.left, (c[1] + d2[1]) / 2 - r.top)
      return
    }
    const d = drag.current
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
      if (!d.moved) return
      d.x = e.clientX; d.y = e.clientY
      setPan(v => clamp({ ...v, x: v.x + dx, y: v.y + dy }))
      return
    }
    const r = ref.current!.getBoundingClientRect()
    const hit = at(e)
    setTip(hit && { ...hit, x: e.clientX - r.left, y: e.clientY - r.top })
  }
  // a click shows the node's own graph; a second click on it goes back (its card opens from its name in the bar)
  const click = (id: string) => setFocus(id === focus ? null : id)
  const hot = tip?.node?.id ?? tip?.ends?.id ?? tip?.leaf ?? null

  return (
    <div className="graph-wrap">
      <div className="graph-bar">
        <span className="slot">
          {focus
            ? <><button className="sel" onClick={() => open(focus)}><b className="jp">{glyph(focus)}</b> {gloss(focus)}</button><button className="whole" onClick={() => setFocus(null)}>back<span className="long"> to the whole graph</span></button></>
            : <span className="how sub small">Left to right by steps: basic parts, then what they build, then what those build. In each step: learning order, down each column.</span>}
        </span>
        <span className="graph-key sub small">
          <svg width="14" height="14"><rect x="1" y="1" width="12" height="12" rx="3" className="k" /></svg> kanji
          <svg width="14" height="14"><rect x="1" y="1" width="12" height="12" rx="3" className="p" /></svg> part
          <svg width="14" height="14"><rect x="1" y="1" width="12" height="12" rx="3" className="k known" /></svg> known
          <svg width="14" height="14"><rect x="1" y="1" width="12" height="12" rx="3" className="k learning" /></svg> learning
        </span>
      </div>
    <div className={'graph' + (moving ? ' moving' : '')} ref={ref}
      onPointerDown={e => { if (e.pointerType === 'mouse') e.preventDefault(); fingers.current.set(e.pointerId, [e.clientX, e.clientY]); drag.current = { x: e.clientX, y: e.clientY, moved: fingers.current.size > 1 }; setGlide(false); setTip(null) }}
      onPointerMove={move}
      onPointerUp={e => { fingers.current.delete(e.pointerId); const d = drag.current; drag.current = null; const hit = at(e); if (!d || d.moved) return; if (hit?.node || hit?.ends) click((hit.node ?? hit.ends)!.id); else if (hit?.leaf) open(hit.leaf); else if (!hit) setFocus(null) }}  // a kanji nothing is built from has no graph of its own: its card. A click on nothing: back to the whole graph, as the card drawer closes
      onPointerLeave={e => { fingers.current.delete(e.pointerId); drag.current = null; setTip(null) }}
      onPointerCancel={e => { fingers.current.delete(e.pointerId); drag.current = null }}>
      <svg role="img" aria-label="Kanji and the parts they are built from">
        <defs><marker id="arrow" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,1L7,4L0,7z" /></marker></defs>
        <g className="pan" ref={panEl}><Scene view={view} store={store} hot={hot} focus={focus} /></g>
      </svg>
      {tip && (
        <div className="graph-tip" ref={tipRef}>
          {tip.node && <><b className="jp">{glyph(tip.node.id)}</b> {gloss(tip.node.id)}<span>in {uses(tip.node.id)} kanji</span></>}
          {tip.link && <><b className="jp">{glyph(tip.link.source.id)} → {glyph(tip.link.target.id)}</b><span>{tip.link.pos.map(p => PLACE[p] ?? p).join(', ') || 'part'}{tip.link.sound ? ' · gives the sound' : ''}</span></>}
          {tip.leaf && <><b className="jp">{tip.leaf}</b> {gloss(tip.leaf)}</>}
          {tip.ends && <><b className="jp">{glyph(tip.ends.id)} →</b><span className="jp many">{tip.ends.ends.join(' ')}</span></>}
        </div>
      )}
    </div>
    </div>
  )
}
