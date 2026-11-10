import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import { COMP, KANJI, gloss } from './data'
import { status, type Store } from './srs'
import { STROKES, treeOf } from './Card'

/*
What kanji are built from, as a graph. A node is anything used as a direct part of something else; an arrow goes
from a part to what it builds (二 → 云 → 雲). A kanji nothing is built from is not drawn: each node counts those
it builds directly ("+23"). The place of the part in the whole (Tree.pos) is on the arrow, shown on hover.
*/
type N = { id: string; r: number; depth: number; ends: string[]; x: number; y: number }
type L = { source: N; target: N; pos: string[]; sound: boolean }

const PLACE: Record<string, string> = {
  left: 'left', right: 'right', top: 'top', bottom: 'bottom', middle: 'middle', inside: 'inside',
  sides: 'left and right', ends: 'top and bottom',
  '⿴': 'frame, all around', '⿵': 'frame, open below', '⿶': 'frame, open above', '⿷': 'frame, open to the right',
  '⿸': 'frame, top and left', '⿹': 'frame, top and right', '⿺': 'frame, left and bottom', '⿻': 'merged into one shape',
}

let cache: { nodes: N[]; links: L[]; box: [number, number, number, number] } | undefined

function layout() {
  if (cache) return cache
  // whole → part → places
  const parts = new Map<string, Map<string, { pos: Set<string>; sound: boolean }>>()
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
  const nodes = new Map<string, N>([...ids].map(id =>
    [id, { id, r: Math.min(34, 9 + 1.6 * Math.sqrt(COMP[id]?.usedIn.length ?? 1)), depth: 0, ends: [], x: NaN, y: NaN }]))
  const links: L[] = []
  for (const [whole, m] of parts) {
    for (const [part, e] of m) {
      if (nodes.has(whole)) links.push({ source: nodes.get(part)!, target: nodes.get(whole)!, pos: [...e.pos], sound: e.sound })
      else nodes.get(part)!.ends.push(whole)
    }
  }
  // basic shapes on the left: depth is the longest chain of parts below
  const below = new Map<string, string[]>()
  for (const l of links) below.set(l.target.id, [...(below.get(l.target.id) ?? []), l.source.id])
  const depth = new Map<string, number>()
  const d = (id: string): number => {
    if (!depth.has(id)) { depth.set(id, 0); depth.set(id, 1 + Math.max(-1, ...(below.get(id) ?? []).map(d))) }
    return depth.get(id)!
  }
  const list = [...nodes.values()]
  const deg = new Map<string, number>()
  for (const l of links) for (const n of [l.source, l.target]) deg.set(n.id, (deg.get(n.id) ?? 0) + 1)
  for (const n of list) n.depth = d(n.id)
  forceSimulation(list)
    .force('link', forceLink(links).distance(l => 30 + (l.source as N).r + (l.target as N).r).strength(l => 0.8 / Math.min(deg.get((l.source as N).id)!, deg.get((l.target as N).id)!)))
    .force('charge', forceManyBody().strength(-45).distanceMax(260))
    .force('collide', forceCollide<N>(n => n.r + (n.ends.length ? 15 : 5)).iterations(2))
    .force('x', forceX<N>(n => n.depth * 380).strength(0.1))
    .force('y', forceY(0).strength(0.03))
    .stop().tick(400)
  const xs = list.map(n => n.x), ys = list.map(n => n.y)
  return cache = { nodes: list, links, box: [Math.min(...xs) - 60, Math.min(...ys) - 60, Math.max(...xs) + 90, Math.max(...ys) + 60] }
}

const glyph = (el: string) => el.startsWith('CDP') ? '◌' : el

const Scene = memo(function Scene({ store, hot }: { store: Store; hot: string | null }) {
  const { nodes, links } = layout()
  const near = useMemo(() => new Set(hot ? links.filter(l => l.source.id === hot || l.target.id === hot).flatMap(l => [l.source.id, l.target.id]) : []), [hot])
  return (
    <g className={hot ? 'has-hot' : ''}>
      {links.map((l, i) => {
        const dx = l.target.x - l.source.x, dy = l.target.y - l.source.y, len = Math.hypot(dx, dy) || 1
        const a = l.source.r + 1, b = len - l.target.r - 5
        const p = (t: number) => `${(l.source.x + dx / len * t).toFixed(1)},${(l.source.y + dy / len * t).toFixed(1)}`
        const d = `M${p(a)}L${p(b)}`
        return <g key={i} data-l={i} className={'gl' + (hot && (l.source.id === hot || l.target.id === hot) ? ' hot' : '')}><path d={d} markerEnd="url(#arrow)" /><path className="hit" d={d} /></g>
      })}
      {nodes.map((n, i) => (
        <g key={n.id} data-n={i} className={'gn ' + status(store, n.id) + (KANJI[n.id] ? '' : ' part') + (n.id === hot || near.has(n.id) ? ' hot' : '')} transform={`translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`}>
          <circle r={n.r} />
          <text fontSize={n.r * 1.15} dy=".36em" textAnchor="middle">{glyph(n.id)}</text>
          {n.ends.length > 0 && <g className="ge" data-e={i}><path d={`M${n.r + 1},0h8`} markerEnd="url(#arrow)" /><text x={n.r + 14} dy=".35em">+{n.ends.length}</text></g>}
        </g>
      ))}
    </g>
  )
})

type Tip = { x: number; y: number; node?: N; link?: L; ends?: N }

export function Graph({ store, open }: { store: Store; open: (el: string) => void }) {
  const { nodes, links, box } = useMemo(layout, [])
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [tip, setTip] = useState<Tip | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const fit = () => {
    const r = ref.current!.getBoundingClientRect()
    const k = Math.min(r.width / (box[2] - box[0]), r.height / (box[3] - box[1]))
    setView({ k, x: (r.width - k * (box[0] + box[2])) / 2, y: (r.height - k * (box[1] + box[3])) / 2 })
  }
  useLayoutEffect(fit, [])
  const zoom = (f: number, cx?: number, cy?: number) => setView(v => {
    const r = ref.current!.getBoundingClientRect()
    const px = cx ?? r.width / 2, py = cy ?? r.height / 2
    const k = Math.min(4, Math.max(0.15, v.k * f))
    return { k, x: px - (px - v.x) * k / v.k, y: py - (py - v.y) * k / v.k }
  })
  useEffect(() => {
    const el = ref.current!
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const at = (e: React.MouseEvent) => {
    const t = e.target as Element
    const g = (k: string) => t.closest(`[data-${k}]`)?.getAttribute(`data-${k}`)
    const en = g('e'), n = g('n'), l = g('l')
    return en != null ? { ends: nodes[+en] } : n != null ? { node: nodes[+n] } : l != null ? { link: links[+l] } : null
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (d) {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 0) d.moved = true
      setView(v => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }))
      return
    }
    const r = ref.current!.getBoundingClientRect()
    const hit = at(e)
    setTip(hit && { ...hit, x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const hot = tip?.node?.id ?? tip?.ends?.id ?? null

  return (
    <div className={'graph' + (drag.current ? ' dragging' : '')} ref={ref}
      onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; setTip(null) }}
      onPointerMove={move}
      onPointerUp={e => { const d = drag.current; drag.current = null; const hit = at(e); if (d && !d.moved && (hit?.node || hit?.ends)) open((hit.node ?? hit.ends)!.id) }}
      onPointerLeave={() => { drag.current = null; setTip(null) }}>
      <svg role="img" aria-label="Kanji and the parts they are built from">
        <defs><marker id="arrow" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1L7,4L0,7z" /></marker></defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}><Scene store={store} hot={hot} /></g>
      </svg>
      <div className="graph-ui">
        <button onClick={() => zoom(1.4)} aria-label="zoom in">+</button>
        <button onClick={() => zoom(1 / 1.4)} aria-label="zoom out">−</button>
        <button onClick={fit}>fit</button>
      </div>
      <p className="graph-key sub small">
        <svg width="14" height="14"><circle cx="7" cy="7" r="6" className="k" /></svg> kanji
        <svg width="14" height="14"><circle cx="7" cy="7" r="6" className="p" /></svg> part that is not a kanji
        <svg width="14" height="14"><circle cx="7" cy="7" r="6" className="k known" /></svg> known
        <svg width="14" height="14"><circle cx="7" cy="7" r="6" className="k learning" /></svg> learning
        <span className="plus">+23</span> kanji built from it that build nothing further
      </p>
      {tip && (
        <div className="graph-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.node && <><b className="jp">{glyph(tip.node.id)}</b> {gloss(tip.node.id)}<span>in {COMP[tip.node.id]?.usedIn.length} kanji</span></>}
          {tip.link && <><b className="jp">{glyph(tip.link.source.id)} → {glyph(tip.link.target.id)}</b><span>{tip.link.pos.map(p => PLACE[p] ?? p).join(', ') || 'part'}{tip.link.sound ? ' · gives the sound' : ''}</span></>}
          {tip.ends && <><b className="jp">{glyph(tip.ends.id)} →</b><span className="jp many">{tip.ends.ends.join(' ')}</span></>}
        </div>
      )}
    </div>
  )
}
