import { COMP, KANJI, elements, extraStrokes, gloss, hira, isKanji, kata, lookalikes, soundFamily, type Tree, type Word } from './data'
import { useEffect } from 'react'
import { status, type Store } from './srs'
import { speak, spoken } from './speech'

type Open = (el: string) => void

const STROKES = new Set(['丿', '丨', '丶', '亅', '乙', '㇒', '㇏', '乚'])

/** KanjiVG names a few shapes that Unicode lacks, like CDP-8BC4. */
export const Glyph = ({ el }: { el: string }) => el.startsWith('CDP') ? <span className="nochar" title={el}>◌</span> : <>{el}</>

const Dot = ({ store, el }: { store: Store; el: string }) => <span className={'dot ' + status(store, el)} title={status(store, el)} />

/** Wherever a part appears first, its subtree; parts that are kanji have their own. */
export function treeOf(el: string): Tree | undefined {
  if (KANJI[el]) return KANJI[el].tree
  const host = COMP[el]?.usedIn[0]
  const find = (t: Tree): Tree | undefined => t.el === el ? t : t.kids.map(find).find(Boolean)
  return host ? find(KANJI[host].tree) : undefined
}

export function Sum({ t, open }: { t: Tree; open: Open }) {
  const extra = extraStrokes(t)
  if (!t.kids.length) return <div className="sum atom">no smaller parts</div>
  return (
    <div className="sum">
      <span className="term self"><span className="ch"><Glyph el={t.el} /></span><span className="g">{gloss(t.el)}</span></span>
      <span className="op">=</span>
      {t.kids.map((k, i) => (
        <span key={i} className="term-wrap">
          {i > 0 && <span className="op">+</span>}
          <button className={'term' + (k.phon ? ' sound' : '')} onClick={() => open(k.el)}>
            <span className="ch"><Glyph el={k.el} /></span>
            <span className="g">{gloss(k.el)}</span>
          </button>
        </span>
      ))}
      {extra > 0 && <><span className="op">+</span><span className="term extra"><span className="ch">·</span><span className="g">{extra} stroke{extra > 1 ? 's' : ''}</span></span></>}
    </div>
  )
}

export function TreeView({ t, store, open, current }: { t: Tree; store: Store; open: Open; current?: string }) {
  const node = (n: Tree, path: string) => {
    const comp = COMP[n.el]
    const on = KANJI[n.el]?.on[0] ?? comp?.on?.[0]
    return (
      <li key={path}>
        <button className={'node' + (n.phon ? ' sound' : '') + (STROKES.has(n.el) ? ' stroke' : '') + (n.el === current ? ' here' : '')} onClick={() => open(n.el)}>
          {!STROKES.has(n.el) && <Dot store={store} el={n.el} />}
          <span className="top"><span className="ch"><Glyph el={n.el} /></span>{on && <span className="on">{on}</span>}</span>
          <span className="g">{gloss(n.el)}</span>
          {n.phon && <span className="tag">sound</span>}
        </button>
        {n.kids.length > 0 && <ul>{n.kids.map((k, i) => node(k, path + i))}</ul>}
      </li>
    )
  }
  return <div className="tree"><ul>{node(t, '')}</ul></div>
}

/** The story with each part's character coloured, so the words point at the shapes. */
export function Story({ el, t }: { el: string; t?: Tree }) {
  const entry = KANJI[el] ?? COMP[el]
  if (!entry?.story) return null
  const parts = t ? elements(t) : new Set<string>()
  return (
    <div className="story">
      <span className="kind">{entry.kind === 'origin' ? 'origin' : 'memory story'}</span>
      <p>{[...entry.story].map((c, i) => c === el ? <b key={i}>{c}</b> : parts.has(c) ? <span key={i} className="part">{c}</span> : c)}</p>
    </div>
  )
}

const fmtKun = (r: string) => {
  const [stem, oku] = r.replace(/^-|-$/g, '').split('.')
  return <>{stem}{oku && <span className="oku">{oku}</span>}</>
}

/** How the kanji is read across common words, as a bar: the reading you meet most comes first. */
export function Readings({ ch }: { ch: string }) {
  const k = KANJI[ch]
  const entries = Object.entries(k.usage)
  const n = entries.reduce((a, [, c]) => a + c, 0)
  const onSet = new Set(k.on.map(hira))
  const kindOf = (r: string) => r === '(irregular)' ? 'irr' : onSet.has(r) ? 'on' : 'kun'
  const label = (r: string) => r === '(irregular)' ? 'special' : onSet.has(r) ? kata(r) : fmtKun(r)
  const shown = entries.filter(([, c]) => c / n >= 0.04)
  const rare = [...k.on.map(hira), ...k.kun].filter(r => !k.usage[r])
  return (
    <div className="readings">
      <div className="lists">
        <span><span className="lbl">on</span> {k.on.join('、') || '—'}</span>
        <span><span className="lbl">kun</span> {k.kun.length ? k.kun.map((r, i) => <span key={r}>{i > 0 && '、'}{fmtKun(r)}</span>) : '—'}</span>
      </div>
      {n > 0 && (
        <>
          <div className="bar" title={`${n} common words`}>
            {shown.map(([r, c]) => <span key={r} className={'seg ' + kindOf(r)} style={{ flexGrow: c }}>{label(r)}</span>)}
          </div>
          <div className="sub small">
            In {n} common words{rare.length > 0 && <>; rare or unused: {rare.map((r, i) => <span key={r}>{i > 0 && '、'}{onSet.has(r) ? kata(r) : fmtKun(r)}</span>)}</>}.
            {' '}<span className="lbl on">on</span> <span className="lbl kun">kun</span> <span className="lbl irr">special</span>
          </div>
        </>
      )}
    </div>
  )
}

export function Family({ ch, store, open }: { ch: string; store: Store; open: Open }) {
  const f = soundFamily(ch)
  if (!f) return null
  const n = f.hits.length + f.misses.length
  const mine = f.hits.includes(ch)
  return (
    <div className="family">
      <p>
        <button className="inline" onClick={() => open(f.phonetic)}>{f.phonetic}</button> gives the sound <b>{kata(f.reading)}</b> in {f.hits.length} of {n} kanji{mine ? '' : ', but not here'}.
      </p>
      <div className="chips">
        {f.hits.map(c => <button key={c} className={'chip ' + status(store, c) + (c === ch ? ' here' : '')} onClick={() => open(c)}>{c}</button>)}
        {f.misses.map(c => <button key={c} className={'chip miss ' + status(store, c) + (c === ch ? ' here' : '')} onClick={() => open(c)} title={KANJI[c]?.on.join('、')}>{c}</button>)}
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
    <section className="alike">
      <h3>One part apart</h3>
      <div className="alike-list">
        {list.map(l => (
          <button key={l.ch} className={'alike-item ' + status(store, l.ch)} onClick={() => open(l.ch)}>
            <span className="ch">{l.ch}</span>
            <span className="g">{gloss(l.ch)}</span>
            <span className="swap"><Glyph el={l.theirs} /> for <Glyph el={l.mine} /></span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function UsedIn({ el, store, open, limit = 24 }: { el: string; store: Store; open: Open; limit?: number }) {
  const list = COMP[el]?.usedIn ?? []
  if (!list.length) return null
  return (
    <div className="used">
      <h3>Part of {list.length} kanji</h3>
      <div className="chips">
        {list.slice(0, limit).map(c => <button key={c} className={'chip ' + status(store, c)} onClick={() => open(c)} title={gloss(c)}>{c}</button>)}
        {list.length > limit && <span className="more">+{list.length - limit}</span>}
      </div>
    </div>
  )
}

export const Speaker = ({ text }: { text: string }) =>
  <button className="speaker" onClick={() => speak(text)} title={`read aloud: ${text}`} aria-label="read aloud">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  </button>

export function Card({ el, store, open, autoSpeak = false }: { el: string; store: Store; open: Open; autoSpeak?: boolean }) {
  const k = KANJI[el]
  const c = COMP[el]
  const t = treeOf(el)
  const say = spoken(el)
  useEffect(() => { if (autoSpeak && say) speak(say) }, [el, autoSpeak])
  return (
    <article className="card">
      <div className="head">
        <span className="big"><Glyph el={el} /></span>
        <div className="title">
          <h2>{gloss(el)}{say && <Speaker text={say} />}</h2>
          {k ? <p className="sub">{k.meanings.slice(0, 4).join(', ')} · {k.strokes} strokes · {k.grade <= 6 ? `grade ${k.grade}` : 'secondary school'}</p>
            : <p className="sub">{c?.note ?? (c?.original ? `form of ${c.original}` : 'a part')}{c?.joyo ? '' : ', not a kanji on its own'}</p>}
        </div>
      </div>
      {t && <Sum t={t} open={open} />}
      <Story el={el} t={t} />
      {k && <Readings ch={el} />}
      {k && <Family ch={el} store={store} open={open} />}
      {t && t.kids.some(k => k.kids.length > 0) && <section><h3>Tree</h3><TreeView t={t} store={store} open={open} current={el} /></section>}
      {k && k.words.length > 0 && <section><h3>Words</h3><ul className="words">{k.words.map(w => <WordRow key={w.w} w={w} ch={el} />)}</ul></section>}
      {k && <Lookalikes ch={el} store={store} open={open} />}
      <UsedIn el={el} store={store} open={open} />
    </article>
  )
}
