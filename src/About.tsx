import { useMemo, useState } from 'react'
import { COMP, D, KANJI, gloss, kata } from './data'
import type { Store } from './srs'
import { KanjiTip, mainReadings } from './Card'
import { BEGINNER, Phi, byLevel, lam, levelOf, mu, reach, temp } from './levels'

type Open = (el: string) => void

/* Both charts are drawn at their own size (400 px wide, never stretched: at a page's width the axis numbers were
larger than the text) and say what they show on the axes, not in a key. */
const W = 400, H = 214, P = { l: 38, r: 14, t: 24, b: 38 }
const N = Object.keys(KANJI).length
const x = (i: number) => P.l + (i / N) * (W - P.l - P.r)
const y = (v: number) => H - P.b - v * (H - P.t - P.b)
const at = (e: React.MouseEvent<SVGSVGElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  const i = Math.round(((e.clientX - r.left) * (W / r.width) - P.l) / (W - P.l - P.r) * N)
  return i >= 0 && i <= N ? i : null
}

function Axes({ yTicks, yTitle, xTitle }: { yTicks: number[]; yTitle: string; xTitle: string }) {
  return (
    <>
      <text className="axis" x={0} y={11}>{yTitle}</text>
      {yTicks.map(v => <g key={v}><line className="grid" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} /><text className="axis" x={P.l - 6} y={y(v) + 4} textAnchor="end">{v * 100}%</text></g>)}
      {[0, 500, 1000, 1500, 2000].map(i => <text key={i} className="axis" x={x(i)} y={H - P.b + 15} textAnchor="middle">{i}</text>)}
      <text className="axis" x={(P.l + W - P.r) / 2} y={H - 4} textAnchor="middle">{xTitle}</text>
    </>
  )
}

/** Share of the kanji in running text written with the n most written kanji, n = 0 … 2136. */
const COVER = Object.values(KANJI).map(k => k.freq).sort((a, b) => b - a).reduce<number[]>((acc, f) => [...acc, acc[acc.length - 1] + f], [0])
/** How many of the most written kanji it takes to read that share of the kanji in text. */
const need = (share: number) => COVER.findIndex(v => v >= share)

/** How much of the kanji in text can be read, by kanji learned; the learner where their own share puts them. */
function CoverageChart({ cov }: { cov: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const line = COVER.filter((_, i) => i % 4 === 0 || i === N).map((v, j, a) => `${j ? 'L' : 'M'}${x(j === a.length - 1 ? N : j * 4).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const you = cov > 0.005 ? need(cov) : null
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={e => setHover(at(e))} onMouseLeave={() => setHover(null)} role="img"
        aria-label="Share of the kanji in text you can read, against the number of kanji learned, most written first">
        <Axes yTicks={[0, .25, .5, .75, 1]} yTitle="kanji in text you can read" xTitle="kanji learned, most written first" />
        <path className="line s1" d={line} />
        {you !== null && (
          <g>
            <line className="you-line" x1={x(you)} x2={x(you)} y1={y(cov)} y2={H - P.b} />
            <circle className="you-dot" cx={x(you)} cy={y(cov)} r={5} />
            <text className="dlabel" x={x(you) + (you > 1500 ? -9 : 9)} y={y(cov) + (you > 1500 ? 16 : 14)} textAnchor={you > 1500 ? 'end' : 'start'}>you: {Math.round(cov * 100)}%</text>
          </g>
        )}
        {hover !== null && <g><line className="cross" x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} /><circle className="pt s1" cx={x(hover)} cy={y(COVER[hover])} r={4} /></g>}
      </svg>
      {hover !== null && <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}><b>{hover} kanji</b><span>{(COVER[hover] * 100).toFixed(1)}% of the kanji in text</span></div>}
    </figure>
  )
}

/** The chance of knowing a kanji against how hard it is: the estimate fitted to the learner's quiz answers, and the answers. */
function LevelChart({ store }: { store: Store }) {
  const [hover, setHover] = useState<number | null>(null)
  const BY_LEVEL = byLevel(lam(store))
  const m = mu(store), t = temp(store)
  const p = (r: number) => Phi((m - r) / t)
  const curve = Array.from({ length: N / 20 + 1 }, (_, i) => Math.min(N, i * 20)).map((r, j) => `${j ? 'L' : 'M'}${x(r).toFixed(1)},${y(p(r)).toFixed(1)}`).join('')
  // the answers by hundreds of kanji: the share right, a larger dot for more answers
  const bins = new Map<number, [number, number]>()
  for (const [ch, k] of store.answers ?? []) {
    const b = Math.floor(levelOf(ch, lam(store)) / 100)
    const [a, c] = bins.get(b) ?? [0, 0]
    bins.set(b, [a + k, c + 1])
  }
  const edge = Math.max(0, Math.min(N, m))
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={e => setHover(at(e))} onMouseLeave={() => setHover(null)} role="img"
        aria-label="Chance that you know a kanji, for kanji from the easiest to the hardest">
        <Axes yTicks={[0, .5, 1]} yTitle="chance you know it" xTitle="kanji, easiest to hardest" />
        <path className="line s1" d={curve} />
        <line className="you-line" x1={x(edge)} x2={x(edge)} y1={y(.5)} y2={H - P.b} />
        <text className="dlabel" x={x(edge) + (edge > 1500 ? -9 : 9)} y={y(.5) + 4} textAnchor={edge > 1500 ? 'end' : 'start'}>you: about {Math.max(0, Math.round(m / 10) * 10)}</text>
        {[...bins].map(([b, [k, c]]) => <circle key={b} className="you-dot" cx={x(b * 100 + 50)} cy={y(k / c)} r={Math.min(7, 2.5 + Math.sqrt(c))} />)}
        {hover !== null && <g><line className="cross" x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} /><circle className="pt s1" cx={x(hover)} cy={y(p(hover))} r={4} /></g>}
      </svg>
      {hover !== null && hover < N && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <span className="jp">{BY_LEVEL.slice(Math.max(0, hover - 3), hover + 4).join('')}</span>
          <span>{Math.round(p(hover) * 100)}% that you know them</span>
        </div>
      )}
    </figure>
  )
}

/** How many of the common parts and common readings are listed. */
const TOP = 10

const Kanji = ({ s, open }: { s: string[]; open: Open }) =>
  <>{s.map(c => <button key={c} className="kbtn" onClick={() => open(c)}>{KANJI[c] ? <KanjiTip c={c} reading={mainReadings(c)} /> : c}</button>)}</>

/** How Kanly works, said plainly for the person using it, in three groups (no labels, only space between them), each set side by side where there is room:
 * you (what you can read, your level), how it works (quiz and card, reviews, data), kanji in numbers (the common parts
 * and readings). The lists come last, so that they do not split the text. No pitch, and nothing the README is for. */
export function About({ store, open }: { store: Store; open: Open }) {
  const cov = reach(store)
  // a level worth drawing: fitted above the beginner's start and at least a few kanji (a μ at or under 0 is "none yet")
  const m = Math.round(mu(store))
  const placed = mu(store) > BEGINNER && m >= 10
  const edge = Math.min(N - 5, Math.max(5, m))
  // the parts whose kanji write the most text, and the parts that most often give a kanji its on-reading
  const parts = useMemo(() => Object.entries(COMP)
    .map(([el, c]) => ({ el, n: c.usedIn.length, share: c.usedIn.reduce((a, k) => a + KANJI[k].freq, 0) }))
    .sort((a, b) => b.share - a.share).slice(0, TOP), [])
  const fams = useMemo(() => [...D.families].sort((a, b) => b.hits.length - a.hits.length || a.misses.length - b.misses.length).slice(0, TOP), [])
  const hits = D.families.reduce((a, f) => a + f.hits.length, 0)
  const members = D.families.reduce((a, f) => a + f.hits.length + f.misses.length, 0)
  const read = <p>{cov > 0.005 && <>You can read {Math.round(cov * 100)}% of the kanji in text. </>}Half of it is the {need(.5)} most written kanji, 90% the {need(.9)} most written.</p>
  return (
    <div className="about">
      <p className="lead">Kanly is for learning the {N} jōyō kanji, each shown as its parts: <span className="jp">照 = 昭 + 灬</span>.</p>

      {placed ? (
        <div className="cols">
          <section>
            <h2>What you can read</h2>
            <CoverageChart cov={cov} />
            {read}
          </section>
          <section>
            <h2>Your level</h2>
            <LevelChart store={store} />
            <p>About {Math.round(m / 10) * 10} kanji, from your quiz answers{(store.answers ?? []).length > 0 && ' (the dots)'}.
              Around it: <span className="edge jp"><Kanji s={byLevel(lam(store)).slice(edge - 5, edge + 5)} open={open} /></span></p>
          </section>
        </div>
      ) : (
        // no level to draw yet: the one chart, with its text beside it
        <>
          <h2>What you can read</h2>
          <div className="cols"><CoverageChart cov={cov} />{read}</div>
        </>
      )}

      <div className="cols">
        <section>
          <h2>New kanji</h2>
          <p>Come most written first, each after its parts; those you surely know are skipped.
            Each is a quiz first, meaning then reading: both right and it counts as known, otherwise you get its card.</p>
        </section>
        <section>
          <h2>Old kanji</h2>
          <p>Come back when you are likely to be forgetting them, not on fixed dates; after a day, as a word whose reading and meaning you type.</p>
        </section>
      </div>

      <div className="cols">
        <section>
          <h2>Common parts</h2>
          <p>Share of the kanji in text written with each part, and how many kanji it is in.</p>
          <div className="bars">
            {parts.map(({ el, n, share }) => (
              <button key={el} className="brow" onClick={() => open(el)}>
                <span className="bch">{el}</span>
                <span className="bname">{gloss(el)}</span>
                <span className="btrack"><span className="bfill" style={{ width: `${share / parts[0].share * 100}%` }} /></span>
                <span className="bval">{(share * 100).toFixed(1)}%</span>
                <span className="bn">{n}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2>Common readings</h2>
          <p>Parts that give a kanji its reading; it holds for {Math.round(100 * hits / members)}%, the exceptions are struck through.</p>
          <table className="tbl">
            <tbody>{fams.map(f => (
              <tr key={f.phonetic}>
                <td><span className="jp"><Kanji s={[f.phonetic]} open={open} /></span></td>
                <td>{kata(f.reading)}</td>
                <td className="jp"><Kanji s={f.hits} open={open} />{f.misses.length > 0 && <span className="miss"> <Kanji s={f.misses} open={open} /></span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      </div>

      <p className="by">Progress is saved in this browser only; settings export it. Made by <a href="https://p.migdal.pl" target="_blank" rel="noreferrer">Piotr Migdał</a>, <a href="https://github.com/stared/kanly" target="_blank" rel="noreferrer">source code</a> on GitHub.</p>
    </div>
  )
}
