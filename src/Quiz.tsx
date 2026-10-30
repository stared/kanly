import { useEffect, useMemo, useState } from 'react'
import { COMP, KANJI, hira } from './data'
import { levelOf } from './levels'
import { Glyph, fmtKun } from './Card'

/** null: not answered ("new to me" before it, or a part, which has no readings). */
export type Result = { meaning: boolean | null; reading: boolean | null; picked: string[] }

const shuffle = <T,>(a: T[]) => a.map(x => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(p => p[1])
const words = (s: string) => s.toLowerCase().split(/[ ;,()]+/).filter(w => w.length > 2)
const isOn = (r: string) => /^[ァ-ヶー]+$/.test(r)
const sound = (r: string) => hira(r.replace('.', ''))

/** Kanji that make good wrong answers for ch: sharing a part first (待 for 持), then near it in difficulty.
 * For meanings, not through the radical, which carries meaning (勤 "labor" would pass for 勉 "exertion"). */
function rivals(ch: string, meaning = false): string[] {
  const k = KANJI[ch], lv = levelOf(ch)
  const near = (c: string) => Math.abs(levelOf(c) - lv)
  const parts = k.tree.kids.filter(t => !(meaning && t.radical)).map(t => t.el)
  const shape = new Set(parts.flatMap(p => COMP[p]?.usedIn ?? []).filter(c => c !== ch && near(c) < 700 && !(meaning && sameRadical(c, ch))))
  const level = Object.keys(KANJI).filter(c => c !== ch && !shape.has(c)).sort((a, b) => near(a) - near(b)).slice(0, 60)
  return [...shuffle([...shape]), ...shuffle(level)]
}

const radical = (ch: string) => KANJI[ch].tree.kids.find(t => t.radical)?.el
const sameRadical = (a: string, b: string) => !!radical(a) && radical(a) === radical(b)

/** The right keyword and three others that cannot be mistaken for synonyms of it. */
export function meaningOptions(ch: string): string[] {
  const k = KANJI[ch]
  const mine = new Set([k.keyword, ...k.also].flatMap(words))
  const out = [ch]
  for (const c of rivals(ch, true)) {
    const o = KANJI[c]
    if (sameRadical(c, ch)) continue
    if (out.length === 4) break
    if (out.some(x => KANJI[x].keyword === o.keyword) || [o.keyword, ...o.also].flatMap(words).some(w => mine.has(w))) continue
    out.push(c)
  }
  return shuffle(out)
}

/** The right reading profile and three of kanji that share none of its readings (nor each other's first one). */
export function readingOptions(ch: string): string[] {
  const mine = new Set(KANJI[ch].readings.map(r => sound(r.r)))
  const out = [ch]
  for (const c of rivals(ch)) {
    if (out.length === 4) break
    const rs = KANJI[c].readings.map(r => sound(r.r))
    if (rs.some(r => mine.has(r)) || out.some(x => sound(KANJI[x].readings[0].r) === rs[0])) continue
    out.push(c)
  }
  return shuffle(out)
}

const fmtReading = (r: string) => isOn(r) ? r : fmtKun(r)

/** How a kanji sounds: its main readings with their share of use. */
export function Profile({ ch, cols }: { ch: string; cols?: boolean }) {
  const rs = KANJI[ch].readings.filter((r, i) => i === 0 || r.share >= 0.05).slice(0, 3)
  return <span className={cols ? 'profile cols' : 'profile'}>{rs.map(({ r, share }) => <span key={r} className="rd">{isOn(r) ? r : fmtKun(r)}{rs.length > 1 && <span className="pct">{Math.round(share * 100)}%</span>}</span>)}</span>
}

/** Ask the meaning among 4, then the reading among 4; a part is asked its meaning only. */
export function Quiz({ el, onDone, unknown = 'new to me' }: { el: string; onDone: (r: Result) => void; unknown?: string }) {
  const k = KANJI[el]
  const [meaning, setMeaning] = useState<string | null>(null)
  const opts = useMemo(() => k ? { m: meaningOptions(el), r: readingOptions(el) } : null, [el])
  const stage = meaning === null ? 'meaning' : 'reading'
  const list = opts ? (stage === 'meaning' ? opts.m : opts.r) : []
  const pick = (c: string | null) => {
    if (stage === 'meaning') {
      if (c === null) return onDone({ meaning: null, reading: null, picked: [] })
      setMeaning(c)
    } else onDone({ meaning: meaning === el, reading: c === null ? null : c === el, picked: [meaning!, ...(c ? [c] : [])] })
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const i = +e.key - 1
      if (i >= 0 && i < list.length) pick(list[i])
      else if (e.key === '0' || e.key === '?') pick(null)
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })
  return (
    <div className="quiz">
      <div className="prompt"><Glyph el={el} /></div>
      <p className="sub">{stage === 'meaning' ? 'What does it mean?' : 'How is it read?'}</p>
      <div className="choices">
        {list.map((c, i) => (
          <button key={c} className="choice" onClick={() => pick(c)}>
            <span className="n">{i + 1}</span>
            {stage === 'meaning' ? <span className="kw">{KANJI[c].keyword}</span> : <Profile ch={c} cols />}
          </button>
        ))}
        <button className="choice unknown" onClick={() => pick(null)}>
          <span className="n">0</span>
          <span className="kw">{stage === 'meaning' ? unknown : 'not sure'}</span>
        </button>
      </div>
    </div>
  )
}

/** One line on how the quiz went, under the revealed card. */
export function Verdict({ el, r }: { el: string; r: Result }) {
  const [m, rd] = r.picked
  if (r.meaning === null) return null
  return (
    <p className="verdict">
      {r.meaning ? <span className="ok">meaning right</span> : <span className="no">meaning: you picked “{KANJI[m]?.keyword}”</span>}
      {r.reading === true && <span className="ok">reading right</span>}
      {r.reading === false && <span className="no">reading: you picked {fmtReading(KANJI[rd].readings[0].r)}</span>}
      {r.reading === null && <span className="no">reading skipped</span>}
    </p>
  )
}
