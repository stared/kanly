import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Glyph } from './Card'
import { track } from './track'

/** How an element is drawn (KanjiVG): strokes in order as SVG paths in a 109 × 109 box; a part taken from inside a
 * kanji carries the box around it, [x, y, side]. */
type Drawing = { d: string[]; box?: [number, number, number] }

// 850 kB gzipped, so it is fetched only when the first card is shown, then kept
let all: Record<string, Drawing> | null = null
let loading: Promise<Record<string, Drawing>> | null = null
const load = () => loading ??= import('./data/strokes.json').then(m => (all = m.default as unknown as Record<string, Drawing>))

export function useDrawing(el: string): Drawing | null | undefined {
  const [, ready] = useState(0)
  useEffect(() => { if (!all) load().then(() => ready(n => n + 1)) }, [])
  return all ? all[el] ?? null : undefined  // undefined: still loading; null: not drawn
}

const viewBox = (g: Drawing) => g.box ? g.box.join(' ') + ' ' + g.box[2] : '0 0 109 109'
// a path may open with a relative m (頃, 慣, 貫...): at the start it means the same as M
const start = (d: string) => d.match(/^[Mm]\s*(-?[\d.]+)[ ,](-?[\d.]+)/)!.slice(1).map(Number)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** The element drawn stroke by stroke, fast, over a faint copy of itself; click to draw it again. */
export function Animated({ el, className }: { el: string; className?: string }) {
  const g = useDrawing(el)
  const ref = useRef<SVGSVGElement>(null)
  const [run, setRun] = useState(0)
  useLayoutEffect(() => {
    const paths = [...ref.current?.querySelectorAll<SVGPathElement>('path.ink') ?? []]
    if (reduced()) return
    let t = 0
    const anims = paths.map(p => {
      const len = p.getTotalLength()
      const ms = 50 + len * 1.4  // a stroke across the box takes about a fifth of a second
      p.style.strokeDasharray = `${len} ${len}`
      const a = p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms, delay: t, fill: 'both', easing: 'ease-in-out' })
      t += ms + 30
      return a
    })
    return () => anims.forEach(a => a.cancel())
  }, [g, run, el])
  if (!g) return <span className={className}><Glyph el={el} /></span>
  return (
    <svg ref={ref} className={'drawn ' + (className ?? '')} viewBox={viewBox(g)} onClick={() => { track('replay', { el }); setRun(run + 1) }} role="img" aria-label={`${el}, drawn stroke by stroke; click to replay`}>
      {g.d.map((d, i) => <path key={'g' + i} className="ghost" d={d} />)}
      {g.d.map((d, i) => <path key={'i' + i + '-' + run} className="ink" d={d} />)}
    </svg>
  )
}

/** Stroke order as frames: each frame adds one stroke (in ink, a dot where it starts) to the ones before (grey). */
export function StrokeOrder({ el, compact }: { el: string; compact?: boolean }) {
  const g = useDrawing(el)
  if (!g || g.d.length < 2) return null
  const vb = viewBox(g)
  const [bx, by, side] = g.box ?? [0, 0, 109]
  const r = side / 109
  const frames = (
      <ol className={'frames' + (compact ? ' compact' : '')} aria-label={`stroke order, ${g.d.length} strokes`}>
        {g.d.map((d, i) => {
          const [x, y] = start(d)
          return (
            <li key={i}>
              <svg viewBox={vb} aria-label={`stroke ${i + 1}`}>
                <line className="guide" x1={bx} y1={by + side / 2} x2={bx + side} y2={by + side / 2} />
                <line className="guide" x1={bx + side / 2} y1={by} x2={bx + side / 2} y2={by + side} />
                {g.d.slice(0, i).map((p, j) => <path key={j} className="done" d={p} />)}
                <path className="now" d={d} />
                <circle className="start" cx={x} cy={y} r={4.5 * r} />
              </svg>
              <span className="n">{i + 1}</span>
            </li>
          )
        })}
      </ol>
  )
  return compact ? frames : <section><h3 className="sec">stroke order <span className="count">{g.d.length} strokes</span></h3>{frames}</section>
}
