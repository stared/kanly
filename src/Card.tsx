import { useEffect } from 'react'
import { COMP, KANJI, elements, extraStrokes, gloss, hira, isKanji, kata, lookalikes, soundFamily, type Tree, type Word } from './data'
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

function Node({ n, store, open, sound }: { n: Tree; store: Store; open: Open; sound?: boolean }) {
  const on = sound ? KANJI[n.el]?.on[0] ?? COMP[n.el]?.on?.[0] : undefined
  return (
    <button className={'node ' + status(store, n.el) + (sound ? ' sound' : '')} onClick={() => open(n.el)}>
      <span className="ch"><Glyph el={n.el} /></span>
      <span className="g">{gloss(n.el)}</span>
      {on && <span className="on">sound {on}</span>}
    </button>
  )
}

function Branch({ n, store, open, sound }: { n: Tree; store: Store; open: Open; sound: (t: Tree) => boolean }) {
  const kids = shownKids(n)
  return (
    <li>
      <Node n={n} store={store} open={open} sound={sound(n)} />
      {kids.length > 0 && <ul>{kids.map((k, i) => <Branch key={i} n={k} store={store} open={open} sound={sound} />)}</ul>}
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
  return (
    <div className="parts">
      {kids.map((k, i) => (
        <div key={i} className="part-col">
          {i > 0 && <span className="op">+</span>}
          <div className="tree"><ul><Branch n={k} store={store} open={open} sound={sound} /></ul></div>
        </div>
      ))}
      {extra > 0 && <div className="part-col"><span className="op">+</span><span className="extra">{extra} stroke{extra > 1 ? 's' : ''}</span></div>}
    </div>
  )
}

/** The story with the kanji and its parts marked, so the words point at the shapes. */
export function Story({ el, t }: { el: string; t?: Tree }) {
  const entry = KANJI[el] ?? COMP[el]
  if (!entry?.story) return null
  const parts = t ? elements(t) : new Set<string>()
  return (
    <div className="story">
      <p>{[...entry.story].map((c, i) => c === el ? <b key={i}>{c}</b> : parts.has(c) ? <span key={i} className="part">{c}</span> : c)}</p>
      <span className="kind">{entry.kind === 'origin' ? 'origin of the shape' : 'memory story'}</span>
    </div>
  )
}

const bare = (r: string) => r.replace(/^-|-$/g, '')
const fmtKun = (r: string) => {
  const [stem, oku] = bare(r).split('.')
  return <>{stem}{oku && <span className="oku">{oku}</span>}</>
}

/** Readings once: each as wide as its share of common words, unused ones after it in grey. */
export function Readings({ ch }: { ch: string }) {
  const k = KANJI[ch]
  const entries = Object.entries(k.usage)
  const n = entries.reduce((a, [, c]) => a + c, 0)
  const onSet = new Set(k.on.map(hira))
  const kindOf = (r: string) => r === '(irregular)' ? 'irr' : onSet.has(r) ? 'on' : 'kun'
  const label = (r: string) => r === '(irregular)' ? 'special' : onSet.has(r) ? kata(r) : fmtKun(r)
  const shown = entries.filter(([, c]) => c / n >= 0.05)
  const all = [...new Set([...k.on.map(hira), ...k.kun.map(bare)])]
  const rest = all.filter(r => !shown.some(([s]) => s === r))
  return (
    <div className="readings" title={n ? `share of ${n} common words` : undefined}>
      {shown.length > 0 && (
        <div className="rbar">
          {shown.map(([r, c]) => (
            <span key={r} className={'seg ' + kindOf(r)} style={{ flexGrow: c }}>
              <span className="r">{label(r)}</span>
              <span className="b" />
            </span>
          ))}
        </div>
      )}
      {rest.length > 0 && <span className="rest">{shown.length ? 'also ' : ''}{rest.map((r, i) => <span key={r}>{i > 0 && '、'}{onSet.has(r) ? kata(r) : fmtKun(r)}</span>)}</span>}
    </div>
  )
}

/** The sound hint, shown only where it holds for this kanji. */
export function Family({ ch, store, open }: { ch: string; store: Store; open: Open }) {
  const f = soundFamily(ch)
  if (!f || !f.hits.includes(ch)) return null
  const n = f.hits.length + f.misses.length
  return (
    <div className="family">
      <p><button className="inline" onClick={() => open(f.phonetic)}>{f.phonetic}</button> sounds <b>{kata(f.reading)}</b> in {f.hits.length} of {n} kanji</p>
      <div className="chips">
        {f.hits.map(c => <button key={c} className={'chip ' + status(store, c) + (c === ch ? ' here' : '')} onClick={() => open(c)}>{c}</button>)}
        {f.misses.map(c => <button key={c} className={'chip miss ' + status(store, c)} onClick={() => open(c)} title={KANJI[c]?.on.join('、')}>{c}</button>)}
      </div>
    </div>
  )
}

function WordRow({ w, ch }: { w: Word; ch: string }) {
  return (
    <li>
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
  return k.meanings.filter(m => !kw.includes(m.toLowerCase()) && !/radical|counter for/.test(m)).slice(0, 3)
}

export function Card({ el, store, open, autoSpeak = false }: { el: string; store: Store; open: Open; autoSpeak?: boolean }) {
  const k = KANJI[el]
  const c = COMP[el]
  const t = treeOf(el)
  const say = spoken(el)
  useEffect(() => { if (autoSpeak && say) speak(say) }, [el, autoSpeak])
  const used = c?.usedIn.length ?? 0
  const alike = k ? lookalikes(el).length : 0
  return (
    <article className="card">
      <div className="hero">
        <span className="big"><Glyph el={el} /></span>
        <h2>{gloss(el)}{say && <Speaker text={say} />}</h2>
        {k ? <p className="also">{otherMeanings(el).join(', ')}</p>
          : <p className="also">{c?.note ?? (c?.original ? `form of ${c.original}` : 'a part')}{c?.joyo ? '' : ', not a kanji on its own'}</p>}
        {k && <Readings ch={el} />}
      </div>
      <Story el={el} t={t} />
      {t && shownKids(t).length > 0 && <section><Divider>parts</Divider><Parts t={t} store={store} open={open} /><Family ch={el} store={store} open={open} /></section>}
      {k && k.words.length > 0 && <section><Divider>words</Divider><ul className="words">{k.words.map(w => <WordRow key={w.w} w={w} ch={el} />)}</ul></section>}
      {(used > 0 || alike > 0) && (
        <details className="more-info">
          <summary>{[alike > 0 && `${alike} look-alike${alike > 1 ? 's' : ''}`, used > 0 && `part of ${used} kanji`, k && `${k.strokes} strokes`].filter(Boolean).join(' · ')}</summary>
          {k && alike > 0 && <><h4>one part apart</h4><Lookalikes ch={el} store={store} open={open} /></>}
          {used > 0 && <><h4>part of</h4><UsedIn el={el} store={store} open={open} /></>}
        </details>
      )}
    </article>
  )
}
