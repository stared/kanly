import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { COMP, KANJI, RANK, extraStrokes, gloss, hira, isKanji, kata, lookalikes, romaji, soundFamily, type Tree, type Word } from './data'
import type { Store } from './srs'
import { standing } from './levels'
import { track } from './track'
import { hoverSay, speak, spoken } from './speech'
import { hovers, tapped } from './pointer'
import { Animated, StrokeOrder } from './Strokes'

type Open = (el: string) => void

export const STROKES = new Set(['丿', '丨', '丶', '亅', '乙', '㇒', '㇏', '乚'])

/** KanjiVG names a few shapes that Unicode lacks, like CDP-8BC4. */
export const Glyph = ({ el }: { el: string }) => el.startsWith('CDP') ? <span className="nochar">◌</span> : <>{el}</>

/** Wherever a part appears first, its subtree; parts that are kanji have their own. */
export function treeOf(el: string): Tree | undefined {
  if (KANJI[el]) return KANJI[el].tree
  const host = COMP[el]?.usedIn[0]
  const find = (t: Tree): Tree | undefined => t.el === el ? t : t.kids.map(find).find(Boolean)
  return host ? find(KANJI[host].tree) : undefined
}

/** Parts worth showing: single strokes are left to the "+ 1 stroke" note. */
const shownKids = (t: Tree) => t.kids.filter(k => !STROKES.has(k.el))

function Node({ n, store, open, sound, label }: { n: Tree; store: Store; open: Open; sound?: boolean; label?: boolean }) {
  const on = sound && label ? KANJI[n.el]?.on[0] ?? COMP[n.el]?.on?.[0] : undefined
  return (
    <button className={'node ' + standing(store, n.el) + (sound ? ' sound' : '')} onClick={() => open(n.el)}>
      <span className="ch"><Glyph el={n.el} /></span>
      <span className="g">{gloss(n.el)}</span>
      {on && <span className="on">sound {on}</span>}
    </button>
  )
}

/** Only kanji are opened up further; a radical form such as 彳 stays whole (KanjiVG would split it into 亻). */
function Branch({ n, store, open, sound, label }: { n: Tree; store: Store; open: Open; sound: (t: Tree) => boolean; label: boolean }) {
  const kids = KANJI[n.el] ? shownKids(n) : []
  return (
    <li>
      <Node n={n} store={store} open={open} sound={sound(n)} label={label} />
      {kids.length > 0 && <ul>{kids.map((k, i) => <Branch key={i} n={k} store={store} open={open} sound={sound} label={label} />)}</ul>}
    </li>
  )
}

/** The kanji as a sum of its parts, each part with its own parts hanging below: 照 = 昭 + 灬, 昭 = 日 + 召, ... */
export function Parts({ t, store, open }: { t: Tree; store: Store; open: Open }) {
  const kids = shownKids(t)
  if (!kids.length) return null
  const extra = extraStrokes(t) + t.kids.filter(k => STROKES.has(k.el)).reduce((a, k) => a + k.strokes, 0)
  // a part marked phonetic is shown as the sound only when it really gives this kanji's on-reading (昭 in 照, not 寺 in 待)
  const unvoiced = (r: string) => hira(r).normalize('NFD').replace(/[\u3099\u309a]/g, '')
  const mine = new Set((KANJI[t.el]?.on ?? []).map(unvoiced))
  const sound = (n: Tree) => !!n.phon && n.el !== t.el && (KANJI[n.el]?.on ?? COMP[n.el]?.on ?? []).some(r => mine.has(unvoiced(r)))
  const label = !soundFamily(t.el)  // the family strip below says it already
  return (
    <div className="parts">
      {kids.map((k, i) => (
        <div key={i} className="part-col">
          {i > 0 && <span className="op">+</span>}
          <div className="tree"><ul><Branch n={k} store={store} open={open} sound={sound} label={label} /></ul></div>
        </div>
      ))}
      {extra > 0 && <div className="part-col"><span className="op">+</span><span className="extra">{extra} stroke{extra > 1 ? 's' : ''}</span></div>}
    </div>
  )
}

/** The story as plain text; one made up to remember the shape (not its history) says so. */
export function Story({ el }: { el: string; t?: Tree }) {
  const entry = KANJI[el] ?? COMP[el]
  if (!entry?.story) return null
  return <p className="story">{entry.story}{entry.kind !== 'origin' && <span className="kind"> mnemonic</span>}</p>
}

const bare = (r: string) => r.replace(/^-|-$/g, '')
export const fmtKun = (r: string) => {
  const [stem, oku] = bare(r).split('.')
  return <>{stem}{oku && <span className="oku">{oku}</span>}</>
}

/** The readings as written for the card, most important first, each with its share among the card's words.
 * The reading of the kanji on its own is red. Click or tap one to hear it; a mouse resting on it also says it and
 * shows the words that use it. */
export function Readings({ ch, hover, setHover, className }: { ch: string; hover?: string | null; setHover?: (r: string | null) => void; className?: string }) {
  const k = KANJI[ch]
  // its romaji shows under a reading while a mouse is on it; after a tap, for a few seconds (which tap: to show it anew)
  const [said, setSaid] = useState<[string, number] | null>(null)
  const isOn = (r: string) => /^[ァ-ヶー]+$/.test(r)
  const say = (r: string) => isOn(r) ? hira(r) : r.replace('.', '')  // the voice says ほう right but ホウ as "horu"
  return (
    <div className={'readings' + (className ? ' ' + className : '')}>
      {k.readings.map(({ r, share }) => (
        <button key={r} className={'rd' + (k.written && share < 0.05 ? ' rare' : '') + (r === k.alone?.reading ? ' alone' : '') + (hover && hover !== r ? ' dim' : '')}
          onClick={() => { speak(say(r)); if (tapped()) setSaid([r, Date.now()]) }} onPointerEnter={e => { if (hovers(e)) { setHover?.(r); hoverSay(say(r)) } }} onPointerLeave={e => { if (hovers(e)) { setHover?.(null); hoverSay(null) } }}>
          <span className="kana">{isOn(r) ? r : fmtKun(r)}<span className={'romaji' + (said?.[0] === r ? ' said' : '')} key={said?.[0] === r ? said[1] : 0}>{isOn(r) ? hira(r) : kata(bare(r).replace('.', ''))} {romaji(r)}</span></span>{k.written && share >= 0.01 && <span className="pct">{Math.round(share * 100)}%</span>}
        </button>
      ))}
    </div>
  )
}

/** The sound hint, shown only where it holds for this kanji. */
export function Family({ ch, store, open }: { ch: string; store: Store; open: Open }) {
  const f = soundFamily(ch)
  if (!f) return null
  const n = f.hits.length + f.misses.length
  const holds = f.hits.includes(ch)
  // the members' own forms: 寺 is シ in 詩 but ジ in 時 持 侍, so say both
  const unvoice = (r: string) => hira(r).normalize('NFD').replace(/[\u3099\u309A]/g, '').normalize('NFC')
  const forms = [...new Set(f.hits.map(c => KANJI[c]?.readings.map(x => x.r).find(r => /^[ァ-ヶー]+$/.test(r) && unvoice(r) === unvoice(f.reading))).filter(Boolean))]
  return (
    <div className="family">
      <p><button className="inline" onClick={() => open(f.phonetic)}>{f.phonetic}</button> {holds ? 'sounds' : 'usually sounds'} <b>{forms.length ? forms.join(' or ') : kata(f.reading)}</b> in {f.hits.length} of {n} kanji{holds ? '' : <>, <span className="not">but not in {ch}</span></>}</p>
      <div className="chips">
        {f.hits.map(c => <button key={c} className={'chip ' + standing(store, c) + (c === ch ? ' here' : '')} onClick={() => open(c)}><KanjiTip c={c} reading={KANJI[c]?.on.join('、')} /></button>)}
        {f.misses.map(c => <button key={c} className={'chip miss ' + standing(store, c) + (c === ch ? ' here' : '')} onClick={() => open(c)}><KanjiTip c={c} reading={KANJI[c]?.on.join('、')} /></button>)}
      </div>
    </div>
  )
}

/** at: the kanji it belongs to; x, y, below: the middle of its top edge, and its bottom; tap: shown by a tap, not a mouse over it. */
type Tip = { c: string; reading?: string; sense?: string; at: Element; x: number; y: number; below: number; tap: boolean }
let setShown: (t: Tip | null) => void = () => {}
let shown: { c: string; since: number; tap: boolean } | null = null
const showTip = (t: Tip) => { hideTip(); shown = { c: t.c, since: Date.now(), tap: t.tap }; setShown(t) }
/** Take the tooltip down. One that was read (up for half a second or more), not passed over, is logged; one shown by
 * a tap stays until the next tap, so its time says little. */
export function hideTip() {
  if (!shown) return
  const { c, since, tap } = shown
  shown = null
  setShown(null)
  if (Date.now() - since >= 500) track('tip', { c, ms: Date.now() - since, ...(tap && { tap }) })
}

/** Its main readings as plain text, for a tooltip: ジン、ニン or き、こ. */
export const mainReadings = (c: string) => KANJI[c]?.readings.slice(0, 2).map(({ r }) => bare(r).replace('.', '')).join('、')

/** One floating tooltip for the whole app, placed above the kanji a mouse is over, or the one last tapped. */
export function TipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  useEffect(() => { setShown = setTip; return () => { setShown = () => {} } }, [])
  useEffect(() => {
    // gone when the page scrolls under it, and when a press lands anywhere but on a kanji (which gets its own)
    const down = (e: PointerEvent) => { if (!(e.target as Element).closest?.('.kt')) hideTip() }
    addEventListener('scroll', hideTip, true)
    addEventListener('pointerdown', down, true)
    return () => { removeEventListener('scroll', hideTip, true); removeEventListener('pointerdown', down, true) }
  }, [])
  // gone with its kanji: a drawer closed by Esc, the next card on Enter, another tab, none of which moves the pointer
  useEffect(() => {
    if (!tip) return
    const gone = new MutationObserver(() => { if (!tip.at.isConnected) hideTip() })
    gone.observe(document.body, { childList: true, subtree: true })
    return () => gone.disconnect()
  }, [tip])
  // kept inside the window: beside a kanji at the edge of a phone it was cut off; under the kanji when there is no room above
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !tip) return
    const half = el.offsetWidth / 2 + 6
    el.style.left = Math.max(half, Math.min(innerWidth - half, tip.x)) + 'px'
    const under = tip.y - el.offsetHeight - 22 < 4
    el.style.top = (under ? tip.below : tip.y) + 'px'
    el.style.transform = under ? 'translate(-50%, 8px)' : ''
  }, [tip])
  if (!tip) return null
  return (
    <div className="ktip" role="tooltip" ref={box} style={{ left: tip.x, top: tip.y }}>
      <b>{tip.c}</b>
      <span className="km">{tip.sense ?? gloss(tip.c)}{tip.sense && tip.sense !== gloss(tip.c) && <span className="kk">{gloss(tip.c)}</span>}</span>
      {tip.reading && <span className="kr">{tip.reading}</span>}
    </div>
  )
}

/** A kanji that shows itself, its meaning (in this word when known: 本 in 日本 is "origin", not "book") and its reading
 * here: while a mouse is over it (a click leaves it up), or, on a touch screen, from a tap until the next tap elsewhere.
 * Opening a card takes it down (App's open). */
export function KanjiTip({ c, reading, sense, className }: { c: string; reading?: string; sense?: string; className?: string }) {
  if (!KANJI[c]) return <span className={className}>{c}</span>
  const show = (e: React.SyntheticEvent<HTMLSpanElement>, tap: boolean) => {
    const r = e.currentTarget.getBoundingClientRect()
    showTip({ c, reading, sense, at: e.currentTarget, x: r.left + r.width / 2, y: r.top, below: r.bottom, tap })
  }
  return <span className={'kt' + (className ? ' ' + className : '')} onPointerEnter={e => { if (hovers(e)) show(e, false) }} onPointerLeave={e => { if (hovers(e)) hideTip() }} onClick={e => { if (tapped()) show(e, true) }}>{c}</span>
}

export function WordRow({ w, ch, dim }: { w: Word; ch: string; dim?: boolean }) {
  let n = 0  // which kanji of the word, for its sense here
  const sense = () => w.senses?.[n++]
  // what the parts say, from what each kanji means in the word, with kana between kanji in romaji: 思い出 think-(i)-out;
  // also for a word read as a whole (今日 now-day); kanji there for their sound alone are one (sound): 富士山 (sound)-mountain
  const lit = (() => {
    const han = (c: string) => /[\u4e00-\u9fff々]/.test(c)  // as the senses count them
    if (!w.senses || w.senses.length !== [...w.w].filter(han).length) return w.lit
    const out: string[] = []
    let k = 0
    w.furigana.forEach(([part], i) => {
      if (![...part].some(han)) {
        if (w.furigana.slice(i + 1).some(([p]) => [...p].some(han)) && out.length) out.push(`(${romaji(part, false)})`)
        return
      }
      for (const c of part) if (han(c)) {
        const x = w.senses![k++]
        if (!(x === '(sound)' && out.at(-1) === '(sound)')) out.push(x)
      }
    })
    return w.senses.length > 1 || w.special || out.includes('(sound)') ? out.join('-') : w.lit
  })()
  return (
    <li className={dim ? 'dim' : ''}>
      <button className="w" onClick={() => speak(w.r)} onPointerEnter={e => { if (hovers(e)) hoverSay(w.r) }} onPointerLeave={e => { if (hovers(e)) hoverSay(null) }}>
        {w.furigana.map(([part, r], i) => r
          ? <ruby key={i} className={part === ch ? 'me' : ''}>{[...part].map((c, j) => <KanjiTip key={j} c={c} reading={w.special ? undefined : r} sense={/[\u4e00-\u9fff々]/.test(c) ? sense() : undefined} />)}<rt>{r}</rt></ruby>
          : <span key={i}>{part}</span>)}
      </button>
      <span className="wg">{w.g}{lit && <span className="lit">{lit}</span>}{w.special && <span className="lit">(read as a whole)</span>}</span>
    </li>
  )
}

/** Kanji that differ from this one in a single part: the pairs worth telling apart. */
export function Lookalikes({ ch, store, open }: { ch: string; store: Store; open: Open }) {
  const list = lookalikes(ch).slice(0, 8)
  if (!list.length) return null
  return (
    <div className="alike-list">
      {list.map(l => (
        <button key={l.ch} className={'alike-item ' + standing(store, l.ch)} onClick={() => open(l.ch)}>
          <span className="ch">{l.ch}</span>
          <span className="g">{gloss(l.ch)}</span>
          <span className="swap"><Glyph el={l.theirs} /> not <Glyph el={l.mine} /></span>
        </button>
      ))}
    </div>
  )
}

export function UsedIn({ el, store, open, rows = 2 }: { el: string; store: Store; open: Open; rows?: number }) {
  const list = COMP[el]?.usedIn ?? []
  const ref = useRef<HTMLDivElement>(null)
  const [perRow, setPerRow] = useState(0)
  const [all, setAll] = useState(false)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    // chips are 34 px with 4 px gaps: fill whole rows, whatever the width
    const fit = () => setPerRow(Math.max(1, Math.floor((box.clientWidth + 4) / 38)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])
  if (!list.length) return null
  const cap = perRow * rows
  const shown = all || !perRow || list.length <= cap ? list : list.slice(0, cap - 1)  // the last slot says how many more
  return (
    <div className="chips" ref={ref}>
      {shown.map(c => <button key={c} className={'chip ' + standing(store, c)} onClick={() => open(c)}><KanjiTip c={c} reading={mainReadings(c)} /></button>)}
      {shown.length < list.length && <button className="chip more-chip" onClick={() => setAll(true)}>+{list.length - shown.length}</button>}
    </div>
  )
}

/** How common the kanji is: its rank and its share of kanji in running text. */
function Popularity({ ch }: { ch: string }) {
  const k = KANJI[ch]
  if (!k.freq) return null
  const pct = k.freq * 100
  return (
    <div className="popular">
      <span>#{RANK.get(ch)}</span>
      <span>{pct >= 0.1 ? pct.toFixed(1) : pct.toFixed(2)}% of text</span>
      <span>{k.kanken === 2.5 ? '準2' : k.kanken}級</span>
    </div>
  )
}

export const Speaker = ({ text }: { text: string }) =>
  <button className="speaker" onClick={() => speak(text)} aria-label="read aloud">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  </button>

const Divider = ({ children }: { children: React.ReactNode }) => <h3 className="divider"><span>{children}</span></h3>

/** What the quiz got right, shown green on the card for a few seconds. */
export type Got = { meaning?: boolean | null; reading?: boolean | null }

/** Known: learned, or assumed known from the learner's level. */
const knows = (store: Store, c: string) => ['known', 'assumed'].includes(standing(store, c))

export function Card({ el, store, open, autoSpeak = false, got }: { el: string; store: Store; open: Open; autoSpeak?: boolean; got?: Got }) {
  const k = KANJI[el]
  const c = COMP[el]
  const t = treeOf(el)
  const say = spoken(el)
  useEffect(() => { if (autoSpeak && say) speak(say) }, [el, autoSpeak])
  const used = c?.usedIn.length ?? 0
  const alike = k ? lookalikes(el).length : 0
  const [hover, setHover] = useState<string | null>(null)
  const [allWords, setAllWords] = useState(false)
  // as many words as fill the window's height (never fewer than the usual): the card grows to it, never past it
  const [fit, setFit] = useState<number | null>(null)
  const sideRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const side = sideRef.current
    if (!k || !side) return
    const measure = () => {
      if (side.closest('.peek')) return setFit(null)
      const rows = [...side.querySelectorAll('.words .w')] as HTMLElement[]
      if (rows.length < 2) return
      const step = (rows[rows.length - 1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top) / (rows.length - 1)
      const main = side.closest('main') as HTMLElement | null
      // the header above, a margin below, and the learn screen's button bar under the card, with its margins
      const bar = main?.querySelector('.actions') as HTMLElement | null
      const barH = bar ? bar.offsetHeight + parseFloat(getComputedStyle(bar).marginTop) + parseFloat(getComputedStyle(bar).marginBottom) : 0
      const room = innerHeight - (main?.getBoundingClientRect().top ?? 0) + scrollY - 40 - barH
      // two columns: the side panel alone has to fit; stacked (a phone, a tablet): the whole card does
      const card = side.parentElement!
      const stacked = side.getBoundingClientRect().top >= card.firstElementChild!.getBoundingClientRect().bottom
      const base = (stacked ? card.offsetHeight : side.offsetHeight) - rows.length * step
      setFit(Math.max(stacked ? Math.min(2, k.nshown) : k.nshown, Math.min(k.words.length, Math.floor((room - base) / step))))
    }
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [el, allWords, fit === null])
  const parts = t && shownKids(t).length > 0
  const words = k && k.words.length > 0
  // the shown words, those whose other kanji are all known first, each group in order of use; then the rest
  const byKnown = (ws: Word[]) => [...ws].sort((a, b) => +!all(a) - +!all(b))
  const shown = allWords ? k?.words.length ?? 0 : fit ?? k?.nshown ?? 0
  const sorted = useMemo(() => k ? [...byKnown(k.words.slice(0, k.nshown)), ...k.words.slice(k.nshown)] : [], [el, store])
  function all(w: Word) { return [...w.w].every(c => c === el || !KANJI[c] || knows(store, c)) }
  return (
    <article className="card">
      <div className="hero">
        {k && <Popularity ch={el} />}
        <div className="top">
          <StrokeOrder el={el} compact />
          <Animated key={el} el={el} className="big" />
          {k && <Readings ch={el} hover={hover} setHover={setHover} className={'aside' + (got?.reading ? ' got' : '')} />}
        </div>
        <h2 className={got?.meaning ? 'got' : ''}>{gloss(el)}</h2>
        {k ? <p className="also">{k.means ? k.means.map(([m, alone]) => alone ? m : `(${m})`).join(', ') : k.also.join(', ')}</p>
          : <p className="also">{c?.note ?? (c?.original ? `form of ${c.original}` : 'a part')}{c?.joyo ? '' : ', not a kanji on its own'}</p>}
        <Story el={el} />
      </div>
      <div className="side" ref={sideRef}>
        {parts && <section><h3 className="sec obvious">parts</h3><Parts t={t!} store={store} open={open} /><Family ch={el} store={store} open={open} /></section>}
        {words && (
          <section>
            <h3 className="sec obvious">most used words</h3>
            <ul className="words">{sorted.slice(0, shown).map(w => <WordRow key={w.w + w.r} w={w} ch={el} dim={!!hover && w.reading !== hover} />)}</ul>
            {k.words.length > (fit ?? k.nshown) && <button className="more-words" onClick={() => { track('words', { el, all: !allWords }); setAllWords(!allWords) }}>{allWords ? 'fewer words' : `${k.words.length - (fit ?? k.nshown)} more words`}</button>}
          </section>
        )}
        {used > 0 && <section><h3 className="sec">part of {used} kanji</h3><UsedIn key={el} el={el} store={store} open={open} /></section>}
        {alike > 0 && (
          <details className="more-info">
            <summary>{alike} look-alike{alike > 1 ? 's' : ''}</summary>
            <Lookalikes ch={el} store={store} open={open} />
          </details>
        )}
      </div>
    </article>
  )
}
