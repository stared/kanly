import { useEffect, useState } from 'react'
import { COMP, KANJI, RANK, extraStrokes, gloss, hira, isKanji, kata, lookalikes, soundFamily, type Tree, type Word } from './data'
import { status, type Store } from './srs'
import { speak, spoken } from './speech'

type Open = (el: string) => void

const STROKES = new Set(['丿', '丨', '丶', '亅', '乙', '㇒', '㇏', '乚'])

/** KanjiVG names a few shapes that Unicode lacks, like CDP-8BC4. */
export const Glyph = ({ el }: { el: string }) => el.startsWith('CDP') ? <span className="nochar" title={el}>◌</span> : <>{el}</>

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
    <button className={'node ' + status(store, n.el) + (sound ? ' sound' : '')} onClick={() => open(n.el)}
      title={`${gloss(n.el)}: ${{ new: 'not learned yet', learning: 'learning (grey edge)', known: 'known (green edge)' }[status(store, n.el)]}${sound ? ', gives the sound' : ''}`}>
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
const fmtKun = (r: string) => {
  const [stem, oku] = bare(r).split('.')
  return <>{stem}{oku && <span className="oku">{oku}</span>}</>
}

/** Readings in one line, on (katakana) and kun (hiragana) together, most used first; rare ones in grey.
 * Click one to hear it, hover to see the words that use it. */
export function Readings({ ch, hover, setHover }: { ch: string; hover?: string | null; setHover?: (r: string | null) => void }) {
  const k = KANJI[ch]
  const n = Object.entries(k.usage).reduce((a, [r, c]) => a + (r === '(irregular)' ? 0 : c), 0) || 1
  const seen = new Set<string>()
  const all = [...k.on.map(r => ({ r: hira(r), on: true })), ...k.kun.map(r => ({ r: bare(r), on: false }))]
    .filter(x => !seen.has(x.r) && seen.add(x.r))
    .sort((a, b) => (k.usage[b.r] ?? 0) - (k.usage[a.r] ?? 0))
  const used = all.filter(x => k.usage[x.r])
  const shown = used.length ? used : all.slice(0, 2)
  const rest = all.filter(x => !shown.includes(x))
  const say = (x: { r: string; on: boolean }) => x.on ? kata(x.r) : x.r.replace('.', '')
  return (
    <div className="readings">
      {[...shown, ...(rest.length === 1 ? rest : [])].map(x => {
        const c = k.usage[x.r] ?? 0
        return (
          <button key={x.r} className={'rd' + (c / n >= 0.1 ? '' : ' rare') + (hover && hover !== x.r ? ' dim' : '')}
            title={c ? `in ${c} of ${n} common words; click to hear it` : 'click to hear it'}
            onClick={() => speak(say(x))} onMouseEnter={() => setHover?.(x.r)} onMouseLeave={() => setHover?.(null)}>
            {x.on ? kata(x.r) : fmtKun(x.r)}{c > 0 && <span className="pct">{Math.round(100 * c / n)}%</span>}
          </button>
        )
      })}
      {rest.length > 1 && <span className="rd rare more-r" title={rest.map(say).join('、')}>+{rest.length} rare</span>}
    </div>
  )
}

/** The sound hint, shown only where it holds for this kanji. */
export function Family({ ch, store, open }: { ch: string; store: Store; open: Open }) {
  const f = soundFamily(ch)
  if (!f) return null
  const n = f.hits.length + f.misses.length
  const holds = f.hits.includes(ch)
  return (
    <div className="family">
      <p><button className="inline" onClick={() => open(f.phonetic)}>{f.phonetic}</button> {holds ? 'sounds' : 'usually sounds'} <b>{kata(f.reading)}</b> in {f.hits.length} of {n} kanji{holds ? '' : <>, <span className="not">but not in {ch}</span></>}</p>
      <div className="chips">
        {f.hits.map(c => <button key={c} className={'chip ' + status(store, c) + (c === ch ? ' here' : '')} onClick={() => open(c)}>{c}</button>)}
        {f.misses.map(c => <button key={c} className={'chip miss ' + status(store, c) + (c === ch ? ' here' : '')} onClick={() => open(c)} title={KANJI[c]?.on.join('、')}>{c}</button>)}
      </div>
    </div>
  )
}

function WordRow({ w, ch, dim }: { w: Word; ch: string; dim?: boolean }) {
  return (
    <li className={dim ? 'dim' : ''}>
      <button className="w" onClick={() => speak(w.r)} title="read aloud">{w.parts
        ? w.parts.map(([c, r], i) => <ruby key={i} className={c === ch ? 'me' : ''}>{c}<rt>{isKanji(c) || c === '々' ? r : ''}</rt></ruby>)
        : <ruby>{[...w.w].map((c, i) => <span key={i} className={c === ch ? 'me' : ''}>{c}</span>)}<rt>{w.r}</rt></ruby>}</button>
      <span className="wg">{w.g}</span>
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
        <button key={l.ch} className={'alike-item ' + status(store, l.ch)} onClick={() => open(l.ch)}>
          <span className="ch">{l.ch}</span>
          <span className="g">{gloss(l.ch)}</span>
          <span className="swap"><Glyph el={l.theirs} /> not <Glyph el={l.mine} /></span>
        </button>
      ))}
    </div>
  )
}

export function UsedIn({ el, store, open, limit = 24 }: { el: string; store: Store; open: Open; limit?: number }) {
  const list = COMP[el]?.usedIn ?? []
  if (!list.length) return null
  return (
    <div className="chips">
      {list.slice(0, limit).map(c => <button key={c} className={'chip ' + status(store, c)} onClick={() => open(c)} title={gloss(c)}>{c}</button>)}
      {list.length > limit && <span className="more">+{list.length - limit}</span>}
    </div>
  )
}

/** How common the kanji is: its rank and its share of kanji in running text. */
function Popularity({ ch }: { ch: string }) {
  const k = KANJI[ch]
  if (!k.freq) return null
  const pct = k.freq * 100
  return (
    <div className="popular" title="among the 2136 jōyō kanji, by count in Japanese Wikipedia">
      <span>#{RANK.get(ch)}</span>
      <span>{pct >= 0.1 ? pct.toFixed(1) : pct.toFixed(2)}% of text</span>
    </div>
  )
}

export const Speaker = ({ text }: { text: string }) =>
  <button className="speaker" onClick={() => speak(text)} title={`read aloud: ${text}`} aria-label="read aloud">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  </button>

const Divider = ({ children }: { children: React.ReactNode }) => <h3 className="divider"><span>{children}</span></h3>

/** Meanings beyond the keyword, so the header line never repeats it. */
const otherMeanings = (ch: string) => {
  const k = KANJI[ch]
  const kw = k.keyword.toLowerCase().split(/;\s*/)
  return k.meanings.filter(m => !kw.includes(m.toLowerCase()) && !/radical|counter for|^\(/.test(m)).slice(0, 3)
}

export function Card({ el, store, open, autoSpeak = false }: { el: string; store: Store; open: Open; autoSpeak?: boolean }) {
  const k = KANJI[el]
  const c = COMP[el]
  const t = treeOf(el)
  const say = spoken(el)
  useEffect(() => { if (autoSpeak && say) speak(say) }, [el, autoSpeak])
  const used = c?.usedIn.length ?? 0
  const alike = k ? lookalikes(el).length : 0
  const [hover, setHover] = useState<string | null>(null)
  const [allWords, setAllWords] = useState(false)
  const parts = t && shownKids(t).length > 0
  const words = k && k.words.length > 0
  return (
    <article className="card">
      <div className="hero">
        {k && <Popularity ch={el} />}
        <span className="big"><Glyph el={el} /></span>
        <h2>{gloss(el)}{say && <Speaker text={say} />}</h2>
        {k ? <p className="also">{otherMeanings(el).join(', ')}</p>
          : <p className="also">{c?.note ?? (c?.original ? `form of ${c.original}` : 'a part')}{c?.joyo ? '' : ', not a kanji on its own'}</p>}
        {k && <Readings ch={el} hover={hover} setHover={setHover} />}
        <Story el={el} />
      </div>
      <div className="side">
        {parts && <section><h3 className="sec">parts</h3><Parts t={t!} store={store} open={open} /><Family ch={el} store={store} open={open} /></section>}
        {words && (
          <section>
            <h3 className="sec">most used words</h3>
            <ul className="words">{k.words.slice(0, allWords ? undefined : 5).map(w => <WordRow key={w.w} w={w} ch={el} dim={!!hover && w.rd !== hover} />)}</ul>
            {k.words.length > 5 && <button className="more-words" onClick={() => setAllWords(!allWords)}>{allWords ? 'fewer words' : `${k.words.length - 5} more words`}</button>}
          </section>
        )}
        {used > 0 && <section><h3 className="sec">part of {used} kanji</h3><UsedIn el={el} store={store} open={open} limit={16} /></section>}
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
