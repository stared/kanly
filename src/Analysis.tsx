import { useMemo, useState } from 'react'
import { COMP, D, KANJI, gloss, kata } from './data'
import type { Store } from './srs'
import { coverage } from './Learn'
import { BEGINNER, Phi, byLevel, lam, levelOf, mu, temp } from './levels'

const SERIES = [
  { key: 'simple first', label: 'simple first (used here)', cls: 's1' },
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
        <text className="dlabel" x={x(640)} y={y(D.curves['simple first'][700]) - 12}>simple first and frequency</text>
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

/** Probability of knowing a kanji against its difficulty rank: the learner's fitted Fermi edge and their answers. */
function LevelChart({ store }: { store: Store }) {
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
      <div className="legend"><span><i className="s1" />chance you knew it before</span>{bins.size > 0 && <span><i className="you" />share you knew, per 100 kanji</span>}</div>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={move} onMouseLeave={() => setHover(null)} role="img" aria-label="Chance of knowing a kanji against its difficulty rank">
        {[0, .5, 1].map(v => <g key={v}><line className="grid" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} /><text className="axis" x={P.l - 6} y={y(v) + 4} textAnchor="end">{v * 100}%</text></g>)}
        {[0, 500, 1000, 1500, 2000].map(i => <text key={i} className="axis" x={x(i)} y={H - 10} textAnchor="middle">{i}</text>)}
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
      <figcaption className="sub small">Jōyō kanji from easiest to hardest. The curve follows your answers.</figcaption>
    </figure>
  )
}

const fmt = (v: number) => v.toFixed(1)
const r10 = (x: number) => Math.max(0, Math.round(x / 10) * 10)
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

  const placed = mu(store) > BEGINNER
  const level = (
      <section>
        <h2>Your level</h2>
        {mu(store) > BEGINNER && <p className="lede">
          You knew about {r10(mu(store))} kanji before starting: nearly all of the {r10(mu(store) - 1.28 * temp(store))} easiest,
          few beyond the {r10(mu(store) + 1.28 * temp(store))}th. Kanji at your edge:
        </p>}
        {mu(store) > BEGINNER && <p className="edge jp">{byLevel(lam(store)).slice(Math.max(0, Math.round(mu(store)) - 6), Math.round(mu(store)) + 6).join('')}</p>}
        <details>
          <summary>how this works</summary>
          <p>
            Kanji have two difficulty orders. By frequency: how often each is written, counted wherever it appears.
            By curriculum: a score fitted to the order JLPT and WaniKani teach in, where one kentei level counts as much as
            text frequency {fmt(10 ** D.levels.weights['kentei level'])}× lower and each stroke as {fmt(10 ** D.levels.weights['strokes'])}× lower.
            The two disagree most on everyday kanji added to the jōyō list in 2010, such as 俺 and 誰: met early, taught late.
            Your order is a mix of the two, {Math.round(lam(store) * 100)}% frequency for you, and your knowledge a step at an edge μ in it, blurred by T;
            all three are refitted after every quiz answer, allowing for a lucky guess (1 in 16) or a slip.
            The next kanji is the most useful one per effort: likely new to you, used in many common words, cheap given the parts you know.
            The table gives each official list as such an edge.
          </p>
          <table className="tbl small">
          <thead><tr><th>official list</th><th>kanji</th><th>edge μ</th><th>blur T</th></tr></thead>
          <tbody>{D.levels.official.map(o => <tr key={o.name}><td>{o.name}</td><td>{o.n}</td><td>{o.mu}</td><td>{o.T}</td></tr>)}</tbody>
        </table>
        </details>
        {mu(store) > BEGINNER ? <LevelChart store={store} /> : <p className="sub">Pick a starting level in settings, or answer a few quizzes, to see your curve here.</p>}
      </section>
  )
  return (
    <div className="analysis">
      {placed && level}
      <section>
        <h2>What each item buys</h2>
        <p className="lede">
          Jōyō kanji write {(all * 100).toFixed(1)}% of kanji in text. For a beginner, Kanly teaches the simplest shapes first: the next kanji is the one
          that adds the most readable text per new stroke (counting the parts it still needs), with simple shapes weighted extra.
          It reaches half of that in {reach(D.curves['simple first'], all / 2)} items, against {reach(D.curves['most text per item'], all / 2)} when
          counting items instead of strokes, {reach(D.curves['frequency'], all / 2)} by plain frequency and {reach(D.curves['school grade'], all / 2)} in school order.
        </p>
        <CoverageChart learned={learned} cov={cov} />
        <table className="tbl small">
          <thead><tr><th>order</th><th>items for 50%</th><th>80%</th><th>90%</th></tr></thead>
          <tbody>{Object.keys(D.curves).map(key => <tr key={key}><td>{key}</td>{[.5, .8, .9].map(t => <td key={t}>{reach(D.curves[key], t * all)}</td>)}</tr>)}</tbody>
        </table>
      </section>

      {!placed && level}
      <section>
        <h2>Parts that pay off</h2>
        <p className="lede">The share of running text written with kanji that contain each part.</p>
        <div className="bars">
          {productive.map(({ el, c, share }) => (
            <div key={el} className="brow">
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
