import { useMemo, useState } from 'react'
import { COMP, D, KANJI, gloss, kata } from './data'
import type { Store } from './srs'
import { coverage } from './Learn'

const SERIES = [
  { key: 'greedy coverage', label: 'most text per new item (used here)', cls: 's1' },
  { key: 'frequency', label: 'by frequency', cls: 's2' },
  { key: 'school grade', label: 'by school grade', cls: 's3' },
]

const W = 720, H = 300, P = { l: 44, r: 16, t: 12, b: 32 }

function CoverageChart({ learned, cov }: { learned: number; cov: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const n = D.curves['frequency'].length
  const x = (i: number) => P.l + (i / n) * (W - P.l - P.r)
  const y = (v: number) => H - P.b - v * (H - P.t - P.b)
  const path = (c: number[]) => c.filter((_, i) => i % 5 === 0 || i === c.length - 1).map((v, j, a) => `${j ? 'L' : 'M'}${x(j === a.length - 1 ? c.length - 1 : j * 5).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const at = 700
  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) * (W / r.width) - P.l) / (W - P.l - P.r) * n)
    setHover(i >= 0 && i < n ? i : null)
  }
  return (
    <figure className="chart">
      <div className="legend">{SERIES.map(s => <span key={s.key}><i className={s.cls} />{s.label}</span>)}{learned > 0 && <span><i className="you" />you</span>}</div>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={move} onMouseLeave={() => setHover(null)} role="img" aria-label="Share of kanji in text you can read, against items learned, for three learning orders">
        {[0, .25, .5, .75, 1].map(v => <g key={v}><line className="grid" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} /><text className="axis" x={P.l - 6} y={y(v) + 4} textAnchor="end">{v * 100}%</text></g>)}
        {[0, 500, 1000, 1500, 2000, 2500].map(i => <text key={i} className="axis" x={x(i)} y={H - 10} textAnchor="middle">{i}</text>)}
        {SERIES.slice().reverse().map(s => <path key={s.key} className={'line ' + s.cls} d={path(D.curves[s.key])} />)}
        {/* direct labels where the lines are apart: the two near-identical orders above, school order below */}
        <text className="dlabel" x={x(640)} y={y(D.curves['greedy coverage'][700]) - 12}>parts-aware and frequency</text>
        <text className="dlabel" x={x(at) + 10} y={y(D.curves['school grade'][at]) + 16}>school grade</text>
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
      <figcaption className="sub small">Items learned (kanji and parts) against the share of kanji in Japanese Wikipedia you can read. Each order learns a kanji right after the parts it still needs.</figcaption>
    </figure>
  )
}

const reach = (c: number[], t: number) => c.findIndex(v => v >= t) + 1

export function Analysis({ store }: { store: Store }) {
  const learned = Object.keys(store.cards).length
  const cov = coverage(Object.keys(store.cards))
  const all = D.curves['frequency'][D.curves['frequency'].length - 1]
  const productive = useMemo(() => Object.entries(COMP)
    .map(([el, c]) => ({ el, c, share: c.usedIn.reduce((a, k) => a + KANJI[k].freq, 0) }))
    .sort((a, b) => b.share - a.share).slice(0, 24), [])
  const [famSort, setFamSort] = useState<'size' | 'weak'>('size')
  const fams = [...D.families].sort((a, b) => famSort === 'size'
    ? b.hits.length - a.hits.length || a.misses.length - b.misses.length
    : b.misses.length / (b.hits.length + b.misses.length) - a.misses.length / (a.hits.length + a.misses.length) || b.misses.length - a.misses.length)
  const hits = D.families.reduce((a, f) => a + f.hits.length, 0)
  const members = D.families.reduce((a, f) => a + f.hits.length + f.misses.length, 0)

  return (
    <div className="analysis">
      <section>
        <h2>What each item buys</h2>
        <p className="lede">
          Jōyō kanji write {(all * 100).toFixed(1)}% of kanji in text. Learning parts first and then the kanji that adds the most
          readable text per new item gets to half of that in {reach(D.curves['greedy coverage'], all / 2)} items,
          against {reach(D.curves['frequency'], all / 2)} by plain frequency and {reach(D.curves['school grade'], all / 2)} in school order.
          Frequency does most of the work; the parts-aware order adds a little more and spreads the parts out.
        </p>
        <CoverageChart learned={learned} cov={cov} />
        <table className="tbl small">
          <thead><tr><th>order</th><th>items for 50%</th><th>80%</th><th>90%</th></tr></thead>
          <tbody>{SERIES.map(s => <tr key={s.key}><td>{s.key}</td>{[.5, .8, .9].map(t => <td key={t}>{reach(D.curves[s.key], t * all)}</td>)}</tr>)}</tbody>
        </table>
      </section>

      <section>
        <h2>Parts that pay off</h2>
        <p className="lede">The share of running text written with kanji that contain each part.</p>
        <div className="bars">
          {productive.map(({ el, c, share }) => (
            <div key={el} className="brow" title={c.usedIn.slice(0, 20).join('')}>
              <span className="bch">{el}</span>
              <span className="bname">{gloss(el)}</span>
              <span className="btrack"><span className="bfill" style={{ width: `${share / productive[0].share * 100}%` }} /></span>
              <span className="bval">{(share * 100).toFixed(1)}%</span>
              <span className="bn">{c.usedIn.length} kanji</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Sound families</h2>
        <p className="lede">
          {D.families.length} parts that KanjiVG marks as phonetic appear in 3 or more jōyō kanji. Their shared on-reading
          holds for {hits} of {members} kanji ({Math.round(100 * hits / members)}%), counting voiced variants (セイ, ゼイ) as the same.
          A hint that works most of the time, so the exceptions matter.
        </p>
        <div className="filters">
          <button className={famSort === 'size' ? 'on' : ''} onClick={() => setFamSort('size')}>largest</button>
          <button className={famSort === 'weak' ? 'on' : ''} onClick={() => setFamSort('weak')}>least reliable</button>
        </div>
        <table className="tbl fam">
          <thead><tr><th>part</th><th>reading</th><th>holds</th><th>kanji</th></tr></thead>
          <tbody>{fams.slice(0, 30).map(f => (
            <tr key={f.phonetic}>
              <td><span className="jp">{f.phonetic}</span> {gloss(f.phonetic)}</td>
              <td>{kata(f.reading)}</td>
              <td>{f.hits.length}/{f.hits.length + f.misses.length}</td>
              <td className="jp">{f.hits.join('')}{f.misses.length > 0 && <span className="miss"> {f.misses.join('')}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  )
}
