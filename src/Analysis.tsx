import { useMemo, useState } from 'react'
import { COMP, D, KANJI, gloss, kata } from './data'
import type { Store } from './srs'
import { KanjiTip, mainReadings } from './Card'
import { BEGINNER, Phi, byLevel, lam, levelOf, mu, reach as reads, temp } from './levels'

const SERIES = [
  { key: 'frequency', label: 'most written first (used here)', cls: 's1' },
  { key: 'school grade', label: 'school grade order', cls: 's3' },
]

const W = 480, H = 260, P = { l: 40, r: 12, t: 12, b: 30 }

function CoverageChart({ cov }: { cov: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const n = D.curves['frequency'].length
  const x = (i: number) => P.l + (i / n) * (W - P.l - P.r)
  const y = (v: number) => H - P.b - v * (H - P.t - P.b)
  const path = (c: number[]) => c.filter((_, i) => i % 5 === 0 || i === c.length - 1).map((v, j, a) => `${j ? 'L' : 'M'}${x(j === a.length - 1 ? c.length - 1 : j * 5).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const learned = cov > 0.005 ? D.curves['frequency'].findIndex(v => v >= cov) : 0
  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) * (W / r.width) - P.l) / (W - P.l - P.r) * n)
    setHover(i >= 0 && i < n ? i : null)
  }
  return (
    <figure className="chart">
      <h2>Text you can read<b>{Math.round(cov * 100)}% of kanji</b></h2>
      <div className="legend">{SERIES.map(s => <span key={s.key}><i className={s.cls} />{s.label}</span>)}{learned > 0 && <span><i className="you" />you</span>}</div>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={move} onMouseLeave={() => setHover(null)} role="img" aria-label="Share of kanji in text you can read, against items learned, for two learning orders">
        {[0, .25, .5, .75, 1].map(v => <g key={v}><line className="grid" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} /><text className="axis" x={P.l - 6} y={y(v) + 4} textAnchor="end">{v * 100}%</text></g>)}
        {[0, 1000, 2000].map(i => <text key={i} className="axis" x={x(i)} y={H - 10} textAnchor="middle">{i}</text>)}
        {SERIES.slice().reverse().map(s => <path key={s.key} className={'line ' + s.cls} d={path(D.curves[s.key])} />)}
        {learned > 0 && <g><line className="you-line" x1={x(learned)} x2={x(learned)} y1={P.t} y2={H - P.b} /><circle className="you-dot" cx={x(learned)} cy={y(cov)} r={5} /></g>}
        {hover !== null && (
          <g>
            <line className="cross" x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} />
            {SERIES.map(s => <circle key={s.key} className={'pt ' + s.cls} cx={x(hover)} cy={y(D.curves[s.key][hover])} r={4} />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>after {hover + 1} items</b>
          {SERIES.map(s => <span key={s.key}><i className={s.cls} />{(D.curves[s.key][hover] * 100).toFixed(1)}% {s.key}</span>)}
        </div>
      )}
      <figcaption className="sub small">Share of kanji in text you can read, by kanji and parts learned.{learned > 0 && ` You read as much as the first ${learned} would give.`}</figcaption>
    </figure>
  )
}

/** Probability of knowing a kanji against its difficulty rank: the learner's fitted Fermi edge and their answers. */
function LevelChart({ store, open }: { store: Store; open: (el: string) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const BY_LEVEL = byLevel(lam(store))
  const n = BY_LEVEL.length, m = mu(store), t = temp(store)
  const x = (r: number) => P.l + (r / n) * (W - P.l - P.r)
  const y = (v: number) => H - P.b - v * (H - P.t - P.b)
  const p = (r: number) => Phi((m - r) / t)
  const curve = Array.from({ length: 108 }, (_, i) => i * 20).map((r, j) => `${j ? 'L' : 'M'}${x(r).toFixed(1)},${y(p(r)).toFixed(1)}`).join('')
  // answers in bins of 100 ranks: share known, dot area by count
  const bins = new Map<number, [number, number]>()
  for (const [ch, k] of store.answers ?? []) {
    const b = Math.floor(levelOf(ch, lam(store)) / 100)
    const [a, c] = bins.get(b) ?? [0, 0]
    bins.set(b, [a + k, c + 1])
  }
  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) * (W / r.width) - P.l) / (W - P.l - P.r) * n)
    setHover(i >= 0 && i < n ? i : null)
  }
  return (
    <figure className="chart">
      <h2>Your level<b>about {Math.max(0, Math.round(m / 10) * 10)} kanji</b></h2>
      <div className="legend"><span><i className="s1" />chance you knew a kanji before</span>{bins.size > 0 && <span><i className="you" />your answers, per 100 kanji</span>}</div>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={move} onMouseLeave={() => setHover(null)} role="img" aria-label="Chance of knowing a kanji against its difficulty rank">
        {[0, .5, 1].map(v => <g key={v}><line className="grid" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} /><text className="axis" x={P.l - 6} y={y(v) + 4} textAnchor="end">{v * 100}%</text></g>)}
        {[0, 1000, 2000].map(i => <text key={i} className="axis" x={x(i)} y={H - 10} textAnchor="middle">{i}</text>)}
        <path className="line s1" d={curve} />
        {[...bins].map(([b, [k, c]]) => <circle key={b} className="you-dot" cx={x(b * 100 + 50)} cy={y(k / c)} r={Math.min(9, 3 + Math.sqrt(c))} />)}
        {hover !== null && <g><line className="cross" x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} /><circle className="pt s1" cx={x(hover)} cy={y(p(hover))} r={4} /></g>}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>#{hover + 1} by difficulty</b>
          <span className="jp">{BY_LEVEL.slice(Math.max(0, hover - 3), hover + 4).join('')}</span>
          <span>{Math.round(p(hover) * 100)}% you knew them</span>
        </div>
      )}
      <figcaption className="sub small">Jōyō kanji from easiest to hardest. The curve follows your quiz answers.
        <span className="edge-line">At your edge <span className="edge jp"><Kanji s={BY_LEVEL.slice(Math.max(0, Math.round(m) - 6), Math.round(m) + 6)} open={open} /></span></span>
      </figcaption>
    </figure>
  )
}

const fmt = (v: number) => v.toFixed(1)
const reach = (c: number[], t: number) => c.findIndex(v => v >= t) + 1
const FEW = 8

type Open = (el: string) => void
const Kanji = ({ s, open }: { s: string[]; open: Open }) =>
  <>{s.map(c => <button key={c} className="kbtn" onClick={() => open(c)}>{KANJI[c] ? <KanjiTip c={c} reading={mainReadings(c)} /> : c}</button>)}</>

export function Analysis({ store, open }: { store: Store; open: Open }) {
  const cov = reads(store)
  const all = D.curves['frequency'][D.curves['frequency'].length - 1]
  const productive = useMemo(() => Object.entries(COMP)
    .map(([el, c]) => ({ el, c, share: c.usedIn.reduce((a, k) => a + KANJI[k].freq, 0) }))
    .sort((a, b) => b.share - a.share).slice(0, 24), [])
  const [famSort, setFamSort] = useState<'size' | 'weak'>('size')
  const [allParts, setAllParts] = useState(false)
  const [allFams, setAllFams] = useState(false)
  const fams = [...D.families].sort((a, b) => famSort === 'size'
    ? b.hits.length - a.hits.length || a.misses.length - b.misses.length
    : b.misses.length / (b.hits.length + b.misses.length) - a.misses.length / (a.hits.length + a.misses.length) || b.misses.length - a.misses.length)
  const hits = D.families.reduce((a, f) => a + f.hits.length, 0)
  const members = D.families.reduce((a, f) => a + f.hits.length + f.misses.length, 0)
  const placed = mu(store) > BEGINNER

  return (
    <div className="analysis">
      <section>
        <div className="charts">
          {placed && <LevelChart store={store} open={open} />}
          <CoverageChart cov={cov} />
        </div>
        <details>
          <summary>how this works</summary>
          <p>
            Jōyō kanji write {(all * 100).toFixed(1)}% of kanji in text. Learning the most written first, each after its parts, reaches half of that
            in {reach(D.curves['frequency'], all / 2)} kanji and parts, and 90% in {reach(D.curves['frequency'], all * .9)};
            school order takes {reach(D.curves['school grade'], all / 2)} and {reach(D.curves['school grade'], all * .9)}.
          </p>
          <p>
            Kanji have two difficulty orders. By frequency: how often each is written, counted wherever it appears.
            By curriculum: a score fitted to the order JLPT and WaniKani teach in, where one kentei level counts as much as
            text frequency {fmt(10 ** D.levels.weights['kentei level'])}× lower and each stroke as {fmt(10 ** D.levels.weights['strokes'])}× lower.
            The two disagree most on everyday kanji added to the jōyō list in 2010, such as 俺 and 誰: met early, taught late.
            Your order is a mix of the two, {Math.round(lam(store) * 100)}% frequency for you, and your knowledge a step at an edge μ in it, blurred by T;
            all three are refitted after every quiz answer, allowing for a lucky guess (1 in 16) or a slip.
            The next kanji is the most useful one per effort: likely new to you and often written.
            The table gives each official list as such an edge.
          </p>
          <table className="tbl small">
            <thead><tr><th>official list</th><th>kanji</th><th>edge μ</th><th>blur T</th></tr></thead>
            <tbody>{D.levels.official.map(o => <tr key={o.name}><td>{o.name}</td><td>{o.n}</td><td>{o.mu}</td><td>{o.T}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      <section>
        <h2>Parts that pay off</h2>
        <p className="sub">Share of running text written with kanji that contain each part.</p>
        <div className="bars">
          {productive.slice(0, allParts ? 24 : FEW).map(({ el, c, share }) => (
            <button key={el} className="brow" onClick={() => open(el)}>
              <span className="bch">{el}</span>
              <span className="bname">{gloss(el)}</span>
              <span className="btrack"><span className="bfill" style={{ width: `${share / productive[0].share * 100}%` }} /></span>
              <span className="bval">{(share * 100).toFixed(1)}%</span>
              <span className="bn">{c.usedIn.length} kanji</span>
            </button>
          ))}
        </div>
        <button className="more-btn" onClick={() => setAllParts(!allParts)}>{allParts ? 'show fewer' : `show all ${productive.length}`}</button>
      </section>

      <section>
        <h2>Sound families</h2>
        <p className="sub">
          A part that gives a kanji its on-reading. Across {D.families.length} such parts the reading holds
          for {Math.round(100 * hits / members)}% of kanji, so the exceptions (struck through) matter.
        </p>
        <select className="pick" aria-label="sort order" value={famSort} onChange={e => setFamSort(e.target.value as 'size' | 'weak')}>
          <option value="size">largest first</option>
          <option value="weak">least reliable first</option>
        </select>
        <table className="tbl fam">
          <thead><tr><th>part</th><th>reading</th><th>holds</th><th>kanji</th></tr></thead>
          <tbody>{fams.slice(0, allFams ? fams.length : FEW).map(f => (
            <tr key={f.phonetic}>
              <td><span className="jp"><Kanji s={[f.phonetic]} open={open} /></span> {gloss(f.phonetic)}</td>
              <td>{kata(f.reading)}</td>
              <td>{f.hits.length}/{f.hits.length + f.misses.length}</td>
              <td className="jp"><Kanji s={f.hits} open={open} />{f.misses.length > 0 && <span className="miss"> <Kanji s={f.misses} open={open} /></span>}</td>
            </tr>
          ))}</tbody>
        </table>
        <button className="more-btn" onClick={() => setAllFams(!allFams)}>{allFams ? 'show fewer' : `show all ${fams.length}`}</button>
      </section>
    </div>
  )
}
