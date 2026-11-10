import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { COMP, KANJI, gloss } from './data'
import { status, type Store } from './srs'
import { STROKES, treeOf } from './Card'

/*
What kanji are built from, as a graph. A node is anything used as a direct part of something else; an arrow goes
from a part to what it builds (二 → 云 → 雲). A kanji nothing is built from is not drawn: each node counts those
it builds directly ("+23"). The place of the part in the whole (Tree.pos) is on the arrow, shown on hover.

Drawn with every arrow, 850 nodes and 1250 arrows are a hairball: a kanji has two or three parts, and 口 alone is
in 66 other nodes. So each node hangs under one main part, the rarest of its parts (時 under 寺, not under 日),
which makes a forest: trees read left to right and no arrow crosses another. The other arrows of a node show on
hover; the layered view draws them all. Clicking a node shows only what it is built from and what it builds, with every arrow.
*/
type N = { id: string; r: number; ends: string[] }
type L = { source: N; target: N; pos: string[]; sound: boolean; nth: number; main?: boolean }
type P = Map<string, [number, number]>
type View = { nodes: N[]; links: L[]; at: P; box: [number, number, number, number] }

const PLACE: Record<string, string> = {
  left: 'left', right: 'right', top: 'top', bottom: 'bottom', middle: 'middle', inside: 'inside',
  sides: 'left and right', ends: 'top and bottom',
  '⿴': 'frame, all around', '⿵': 'frame, open below', '⿶': 'frame, open above', '⿷': 'frame, open to the right',
  '⿸': 'frame, top and left', '⿹': 'frame, top and right', '⿺': 'frame, left and bottom', '⿻': 'merged into one shape',
}
const COL = 108, ROW = 38
const uses = (id: string) => COMP[id]?.usedIn.length ?? 1

const boxOf = (at: P): View['box'] => {
  const xs = [...at.values()].map(p => p[0]), ys = [...at.values()].map(p => p[1])
  return [Math.min(...xs) - 40, Math.min(...ys) - 64, Math.max(...xs) + 70, Math.max(...ys) + 56]
}

let G: { nodes: Map<string, N>; links: L[]; into: Map<string, L[]>; out: Map<string, L[]> } | undefined
function graph() {
  if (G) return G
  const parts = new Map<string, Map<string, { pos: Set<string>; sound: boolean; nth: number }>>()  // whole → part → places
  for (const el of Object.keys(COMP)) {
    for (const k of treeOf(el)?.kids ?? []) {
      if (STROKES.has(k.el) || k.el === el) continue
      const m = parts.get(el) ?? parts.set(el, new Map()).get(el)!
      const e = m.get(k.el) ?? m.set(k.el, { pos: new Set(), sound: false, nth: m.size }).get(k.el)!
      if (k.pos) e.pos.add(k.pos)
      if (k.phon) e.sound = true
    }
  }
  const ids = new Set([...parts.values()].flatMap(m => [...m.keys()]))
  const nodes = new Map<string, N>([...ids].map(id => [id, { id, r: 11 + Math.min(5, Math.sqrt(uses(id)) / 3), ends: [] }]))
  const links: L[] = [], into = new Map<string, L[]>(), out = new Map<string, L[]>()
  for (const [whole, m] of parts) {
    for (const [part, e] of m) {
      if (!nodes.has(whole)) { nodes.get(part)!.ends.push(whole); continue }
      const l = { source: nodes.get(part)!, target: nodes.get(whole)!, pos: [...e.pos], sound: e.sound, nth: e.nth }
      links.push(l)
      into.set(whole, [...(into.get(whole) ?? []), l])
      out.set(part, [...(out.get(part) ?? []), l])
    }
  }
  return G = { nodes, links, into, out }
}

/** Which of its parts a node hangs under. */
const UNDER = {
  'its rarest part': (a: L, b: L) => uses(a.source.id) - uses(b.source.id),  // a family gathers under what is particular to it
  'its most used part': (a: L, b: L) => uses(b.source.id) - uses(a.source.id),
  'its sound part': (a: L, b: L) => +b.sound - +a.sound || uses(a.source.id) - uses(b.source.id),
  'its first part': (a: L, b: L) => a.nth - b.nth,  // as written: the left or top one
}
type Under = keyof typeof UNDER
type How = 'layers' | Under

const FOREST = new Map<string, View>()
/** Every node under its main part: tidy trees, packed on shelves from the tallest down. */
function forest(under: Under, aspect: number): View {
  const key = under + aspect.toFixed(1)
  if (FOREST.has(key)) return FOREST.get(key)!
  const { nodes, into } = graph()
  const main = new Set([...into.values()].map(ls => [...ls].sort(UNDER[under])[0]))
  const links = graph().links.map(l => ({ ...l, main: main.has(l) }))
  const out = new Map<string, L[]>()
  for (const l of links) out.set(l.source.id, [...(out.get(l.source.id) ?? []), l])
  const kids = (id: string) => (out.get(id) ?? []).filter(l => l.main).map(l => l.target.id).sort((a, b) => uses(b) - uses(a))
  const trees = [...nodes.keys()].filter(id => !into.has(id)).map(root => {
    const at: P = new Map()
    let row = 0, depth = 0
    const put = (id: string, level: number): number => {
      depth = Math.max(depth, level)
      const ys = kids(id).map(k => put(k, level + 1))
      const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : row++ * ROW
      at.set(id, [level * COL, y])
      return y
    }
    put(root, 0)
    return { at, w: (depth + 1) * COL, h: row * ROW }
  }).sort((a, b) => b.h - a.h || b.w - a.w)
  const width = Math.sqrt(trees.reduce((a, t) => a + (t.w + 12) * (t.h + ROW * 0.6), 0) * aspect) * 1.04
  const at: P = new Map()
  let x = 0, y = 0, shelf = 0
  for (const t of trees) {
    if (x > 0 && x + t.w > width) { x = 0; y += shelf + ROW * 0.6; shelf = 0 }
    for (const [id, [px, py]] of t.at) at.set(id, [x + px, y + py])
    x += t.w + 12
    shelf = Math.max(shelf, t.h)
  }
  const view = { nodes: [...nodes.values()], links, at, box: boxOf(at) }
  FOREST.set(key, view)
  return view
}

const LAYERS = new Map<string, View>()
/** The graph as it is, every arrow drawn: a column block per depth (the longest chain of parts below a node), shapes
 * with no parts on the left. Within a block a node sits near the height of its parts, so arrows stay short. */
function layers(aspect: number): View {
  const key = aspect.toFixed(1)
  if (LAYERS.has(key)) return LAYERS.get(key)!
  const { nodes, into, out } = graph()
  const depth = new Map<string, number>()
  const d = (id: string): number => {
    if (!depth.has(id)) { depth.set(id, 0); depth.set(id, 1 + Math.max(-1, ...(into.get(id) ?? []).map(l => d(l.source.id)))) }
    return depth.get(id)!
  }
  const bands: string[][] = []
  for (const id of nodes.keys()) (bands[d(id)] ??= []).push(id)
  const W = 64, H = 34, GAP = 80
  // rows per block: the count that gives the window's shape
  const wide = (rows: number) => bands.reduce((a, b) => a + Math.ceil(b.length / rows) * W + GAP, 0)
  let rows = 8
  for (let r = 8; r < 120; r++) if (Math.abs(wide(r) / (r * H) - aspect) < Math.abs(wide(rows) / (rows * H) - aspect)) rows = r
  const at: P = new Map()
  const want = (id: string, ls: L[] | undefined, end: 'source' | 'target') => {
    const ys = (ls ?? []).map(l => at.get(l[end].id)?.[1]).filter(y => y !== undefined) as number[]
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0
  }
  const place = (b: number, key: (id: string) => number) => {
    const cols = Math.ceil(bands[b].length / rows), x0 = bands.slice(0, b).reduce((a, p) => a + Math.ceil(p.length / rows) * W + GAP, 0)
    const sorted = bands[b].map(id => [id, key(id)] as const).sort((p, q) => p[1] - q[1] || uses(q[0]) - uses(p[0]))
    const used = Math.ceil(sorted.length / cols)
    sorted.forEach(([id], i) => at.set(id, [x0 + (i % cols) * W, (Math.floor(i / cols) - (used - 1) / 2) * H]))
  }
  place(0, () => 0)
  for (let b = 1; b < bands.length; b++) place(b, id => want(id, into.get(id), 'source'))
  for (let b = bands.length - 2; b >= 0; b--) place(b, id => want(id, out.get(id), 'target'))
  for (let b = 1; b < bands.length; b++) place(b, id => want(id, into.get(id), 'source'))
  const view = { nodes: [...nodes.values()], links: graph().links.map(l => ({ ...l, main: true })), at, box: boxOf(at) }
  LAYERS.set(key, view)
  return view
}

/** One node with all it is built from (to its left) and all it builds (to its right), every arrow among them. */
function around(id: string): View {
  const { nodes, links, into, out } = graph()
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
  const cols = new Map<number, string[]>()
  for (const [n, c] of col) cols.set(c, [...(cols.get(c) ?? []), n])
  const at: P = new Map([[id, [0, 0]]])
  // from the node outwards, each column ordered by where its neighbours already are
  for (const c of [...cols.keys()].filter(c => c).sort((a, b) => Math.abs(a) - Math.abs(b))) {
    const mean = (n: string) => {
      const ys = shown.filter(l => l.source.id === n || l.target.id === n).map(l => at.get(l.source.id === n ? l.target.id : l.source.id)?.[1]).filter(y => y !== undefined) as number[]
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0
    }
    const order = cols.get(c)!.map(n => [n, mean(n)] as const).sort((a, b) => a[1] - b[1] || uses(b[0]) - uses(a[0]))
    order.forEach(([n], i) => at.set(n, [c * COL * 1.5, (i - (order.length - 1) / 2) * ROW]))
  }
  const box = boxOf(at)
  if (nodes.get(id)!.ends.length) box[3] += 110  // room for the strip of kanji it builds
  return { nodes: [...col.keys()].map(n => nodes.get(n)!), links: shown.map(l => ({ ...l, main: true })), at, box }
}

const glyph = (el: string) => el.startsWith('CDP') ? '◌' : el

const ALL = () => [...graph().nodes.values()]

/** Every node is always drawn, so that it glides to its place when the view changes (CSS transition on transform);
 * a node the view leaves out fades where it was. Arrows cannot glide, so they fade out and back in (.moving). */
const Scene = memo(function Scene({ view, store, hot, focus }: { view: View; store: Store; hot: string | null; focus: string | null }) {
  const { links, at } = view
  const last = useRef<P>(new Map())
  const near = useMemo(() => new Set(hot ? links.filter(l => l.source.id === hot || l.target.id === hot).flatMap(l => [l.source.id, l.target.id]) : []), [hot, view])
  const fans = useMemo(() => new Set(links.filter(l => l.main).map(l => l.source.id)), [view])
  useEffect(() => { for (const [id, p] of at) last.current.set(id, p) }, [view])
  return (
    <g className={hot ? 'has-hot' : ''}>
      {links.map((l, i) => {
        const touch = hot && (l.source.id === hot || l.target.id === hot)
        if (!l.main && !touch) return null
        const [sx, sy] = at.get(l.source.id)!, [tx, ty] = at.get(l.target.id)!
        let d: string
        if (tx - sx > l.source.r + l.target.r + 12) {  // to the right: a curve leaving and arriving level
          const a = sx + l.source.r + 1, b = tx - l.target.r - 5, m = (a + b) / 2
          d = `M${a},${sy.toFixed(1)}C${m.toFixed(1)},${sy.toFixed(1)} ${m.toFixed(1)},${ty.toFixed(1)} ${b - 3},${ty.toFixed(1)}L${b},${ty.toFixed(1)}`
        } else {
          const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1
          const p = (t: number) => `${(sx + dx / len * t).toFixed(1)},${(sy + dy / len * t).toFixed(1)}`
          d = `M${p(l.source.r + 1)}L${p(len - l.target.r - 5)}`
        }
        return <g key={i} data-l={i} className={'gl' + (l.main ? '' : ' other') + (touch ? ' hot' : '')}><path d={d} markerEnd="url(#arrow)" /><path className="hit" d={d} /></g>
      })}
      {ALL().map((n, i) => {
        const here = at.get(n.id)
        const [x, y] = here ?? last.current.get(n.id) ?? [0, 0], up = fans.has(n.id)  // arrows leave to the right: the count goes up and right
        return (
          <g key={n.id} data-n={i} className={'gn ' + status(store, n.id) + (KANJI[n.id] ? '' : ' part') + (here ? '' : ' gone') + (n.id === hot || near.has(n.id) ? ' hot' : '') + (n.id === focus ? ' focus' : '')} style={{ transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)` }}>
            <circle r={n.r} />
            <text fontSize={n.r * 1.15} dy=".36em" textAnchor="middle">{glyph(n.id)}</text>
            {n.ends.length > 0 && (up
              ? <g className="ge" data-e={i}><path d={`M${(n.r * .74).toFixed(1)},${(-n.r * .74).toFixed(1)}l5,-5`} markerEnd="url(#arrow)" /><text x={n.r * .74 + 9} y={-n.r * .74 - 7}>+{n.ends.length}</text></g>
              : <g className="ge" data-e={i}><path d={`M${n.r + 1},0h7`} markerEnd="url(#arrow)" /><text x={n.r + 13} dy=".35em">+{n.ends.length}</text></g>)}
          </g>
        )
      })}
    </g>
  )
})

type Tip = { x: number; y: number; node?: N; link?: L; ends?: N }

export function Graph({ store, open }: { store: Store; open: (el: string) => void }) {
  const [focus, setFocus] = useState<string | null>(null)
  const [how, setHow] = useState<How>('its rarest part')
  const ref = useRef<HTMLDivElement>(null)
  // the window's shape when the tab opens (below the top bar and the graph's own), so that the whole graph fills it
  const [aspect] = useState(() => Math.min(3, Math.max(0.5, innerWidth / Math.max(200, innerHeight - 110))))
  const view = useMemo(() => focus ? around(focus) : how === 'layers' ? layers(aspect) : forest(how, aspect), [focus, how, aspect])
  const { links, box } = view
  const nodes = useMemo(ALL, [])
  const [pan, setPan] = useState({ x: 0, y: 0, k: 1 })
  const [glide, setGlide] = useState(false)   // the view moves by itself (a new layout, a button), not under the hand
  const [moving, setMoving] = useState(false) // nodes are on their way: arrows wait
  const [tip, setTip] = useState<Tip | null>(null)
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
  // first at a size that can be read: the whole graph from its top left corner, a node's own graph around the node
  const start = () => {
    const r = ref.current!.getBoundingClientRect()
    if (!focus) return setPan(clamp({ x: 0, y: 0, k: 0 }))
    const k = Math.max(0.75, clamp({ x: 0, y: 0, k: 0 }).k)
    setPan(clamp({ k, x: 24 - k * box[0], y: r.height / 2 }))
  }
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
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocus(null) }
    const resize = () => setPan(clamp)
    el.addEventListener('wheel', wheel, { passive: false })
    addEventListener('keydown', esc)
    addEventListener('resize', resize)
    return () => { el.removeEventListener('wheel', wheel); removeEventListener('keydown', esc); removeEventListener('resize', resize) }
  }, [])

  const at = (e: React.MouseEvent) => {
    const t = e.target as Element
    const g = (k: string) => t.closest(`[data-${k}]`)?.getAttribute(`data-${k}`)
    const en = g('e'), n = g('n'), l = g('l')
    return en != null ? { ends: nodes[+en] } : n != null ? { node: nodes[+n] } : l != null ? { link: links[+l] } : null
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
  // a click shows the node's own graph; on the node already shown, its card
  const click = (id: string) => id === focus ? open(id) : setFocus(id)
  const hot = tip?.node?.id ?? tip?.ends?.id ?? null
  const ends = focus ? graph().nodes.get(focus)!.ends : []

  return (
    <div className="graph-wrap">
      <div className="graph-bar">
        {focus
          ? <><button className="btn" onClick={() => setFocus(null)}>← whole graph</button><span className="what"><b className="jp">{glyph(focus)}</b> {gloss(focus)}</span><button className="btn" onClick={() => open(focus)}>open card</button></>
          : <>
              <select aria-label="layout" value={how} onChange={e => setHow(e.target.value as How)}>
                <option value="layers">layers by depth, every arrow</option>
                {Object.keys(UNDER).map(u => <option key={u} value={u}>trees, each under {u}</option>)}
              </select>
            </>}
        <span className="graph-key sub small">
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" className="k" /></svg> kanji
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" className="p" /></svg> part
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" className="k known" /></svg> known
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" className="k learning" /></svg> learning
        </span>
      </div>
    <div className={'graph' + (moving ? ' moving' : '') + (glide ? ' glide' : '')} ref={ref}
      onPointerDown={e => { if (!(e.target as Element).closest('.graph-ends')) { if (e.pointerType === 'mouse') e.preventDefault(); fingers.current.set(e.pointerId, [e.clientX, e.clientY]); drag.current = { x: e.clientX, y: e.clientY, moved: fingers.current.size > 1 }; setGlide(false); setTip(null) } }}
      onPointerMove={move}
      onPointerUp={e => { fingers.current.delete(e.pointerId); const d = drag.current; drag.current = null; const hit = at(e); if (d && !d.moved && (hit?.node || hit?.ends)) click((hit.node ?? hit.ends)!.id) }}
      onPointerLeave={e => { fingers.current.delete(e.pointerId); drag.current = null; setTip(null) }}
      onPointerCancel={e => { fingers.current.delete(e.pointerId); drag.current = null }}>
      <svg role="img" aria-label="Kanji and the parts they are built from">
        <defs><marker id="arrow" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1L7,4L0,7z" /></marker></defs>
        <g className="pan" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${pan.k})` }}><Scene view={view} store={store} hot={hot} focus={focus} /></g>
      </svg>
      {focus && ends.length > 0 && <div className="graph-ends"><span className="sub small">builds, and nothing further</span><div className="chips">{ends.map(c => <button key={c} className={'chip ' + status(store, c)} onClick={() => open(c)}>{c}</button>)}</div></div>}
      {tip && (
        <div className="graph-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.node && <><b className="jp">{glyph(tip.node.id)}</b> {gloss(tip.node.id)}<span>in {uses(tip.node.id)} kanji</span></>}
          {tip.link && <><b className="jp">{glyph(tip.link.source.id)} → {glyph(tip.link.target.id)}</b><span>{tip.link.pos.map(p => PLACE[p] ?? p).join(', ') || 'part'}{tip.link.sound ? ' · gives the sound' : ''}</span></>}
          {tip.ends && <><b className="jp">{glyph(tip.ends.id)} →</b><span className="jp many">{tip.ends.ends.join(' ')}</span></>}
        </div>
      )}
    </div>
    </div>
  )
}
