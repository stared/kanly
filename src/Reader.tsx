import { useEffect, useMemo, useState } from 'react'
import { COMP, KANJI, type Word } from './data'
import type { Store } from './srs'
import { standing } from './levels'
import { KanjiTip, WordTip, mainReadings } from './Card'
import { index, isHan, tokenize, type Entry, type Token } from './tokens'

const SAMPLE = `日本は東アジアにある島国で、首都は東京です。人口は約一億二千万人で、多くの人が大きな都市に住んでいます。春には桜が咲き、秋には山の木の葉が赤や黄色に変わります。`

type Furigana = 'new' | 'all' | 'off'

/** A word of the list as a kanji's card has it (furigana kanji by kanji, what each kanji means in it); one on no card
 * with its reading over the kanji before its last kana. */
function asWord([w, r, g]: Entry): Word {
  for (const c of w) {
    const hit = KANJI[c]?.words.find(x => x.w === w && x.r === r)
    if (hit) return hit
  }
  const tail = w.match(/[ぁ-ゖ]+$/)?.[0] ?? ''
  const cut = !!tail && r.endsWith(tail) && r.length > tail.length
  return { w, r, g, reading: '', f: 0, furigana: cut ? [[w.slice(0, -tail.length), r.slice(0, -tail.length)], [tail, '']] : [[w, r]] }
}

/** Each character apart, so that a click says which kanji it was on. */
const Chars = ({ text }: { text: string }) => <>{[...text].map((c, i) => <span key={i} className="c">{c}</span>)}</>

/** Furigana over the kanji only: 住む (すむ) shows す over 住, and the kana after it stay as written. */
function Ruby({ t }: { t: Token }) {
  const [w, r] = t.entry!
  const okurigana = w.match(/[ぁ-ゖ]+$/)?.[0] ?? ''
  const head = t.text.replace(/[ぁ-ゖ]+$/, '')
  const tail = t.text.slice(head.length)
  const base = okurigana && r.endsWith(okurigana) ? r.slice(0, r.length - okurigana.length) : r
  return <><ruby><Chars text={head} /><rt>{base}</rt></ruby>{tail}</>
}

/** A text to read. A word under the mouse shows what it is there: the word, its meaning, its reading. A kanji clicked
 * opens its card, as a kanji does anywhere, with the word it was in on top. */
export function Reader({ store, open }: { store: Store; open: (el: string, word?: Word) => void }) {
  const [text, setText] = useState(SAMPLE)
  const [editing, setEditing] = useState(false)
  const [words, setWords] = useState<Entry[] | null>(null)
  const [furi, setFuri] = useState<Furigana>('new')
  useEffect(() => { import('./data/words.json').then(m => setWords(m.default as Entry[])) }, [])
  const ix = useMemo(() => words && index(words), [words])
  const tokens = useMemo<Token[]>(() => ix ? tokenize(text, ix) : [...text].map(c => ({ text: c })), [text, ix])

  const han = [...text].filter(c => isHan(c) && c !== '々')
  // read: learned here, or a jōyō kanji assumed known from the learner's level (someone who starts at N2 was never asked
  // about 日). A kanji outside the 2136 that is a part of some (吾 in 語) is assumed as a shape, not as something read
  const read = (c: string) => !!store.cards[c] || (!!KANJI[c] && standing(store, c) === 'assumed')
  const known = han.filter(read).length
  const assumed = han.filter(c => !store.cards[c] && read(c)).length
  const unknown = [...new Set(han)].filter(c => !read(c) && KANJI[c])
  const showFuri = (t: Token) => furi === 'all' || (furi === 'new' && [...t.text].some(c => isHan(c) && c !== '々' && !read(c)))
  const has = (c: string) => !!KANJI[c] || !!COMP[c]
  /** The kanji clicked, or the word's first one that has a card. */
  const look = (t: Token, at: Element) => {
    const c = at.closest('.c, .kt')?.textContent ?? ''
    const el = has(c) ? c : [...t.text].find(has)
    if (el) open(el, t.entry && asWord(t.entry))
  }

  return (
    <div className="reader">
      {editing && <textarea autoFocus value={text} onChange={e => setText(e.target.value)} onBlur={() => setEditing(false)} rows={5} placeholder="Paste Japanese text" />}
      <div className="bar-line sub small">
        <span>You know {known} of {han.length} kanji here ({han.length ? Math.round(100 * known / han.length) : 0}%){assumed > 0 && `, ${assumed} of them assumed from your level`}.</span>
        <span className="opts">
          <label>furigana <select value={furi} onChange={e => setFuri(e.target.value as Furigana)}>
            {(['new', 'all', 'off'] as Furigana[]).map(f => <option key={f} value={f}>{f === 'new' ? 'for new kanji' : f === 'all' ? 'for all' : 'off'}</option>)}
          </select></label>
          {!editing && <button className="inline" onClick={() => setEditing(true)}>edit text</button>}
        </span>
      </div>
      <div className="text">
        {tokens.map((t, i) => !isHan(t.text[0]) ? <span key={i}>{t.text}</span> : (
          <button key={i} className={'tok' + ([...t.text].some(c => isHan(c) && c !== '々' && !read(c)) ? ' new' : '')} onClick={e => look(t, e.target as Element)}>
            {t.entry ? <WordTip w={{ w: t.entry[0], r: t.entry[1], g: t.entry[2] }}>{showFuri(t) ? <Ruby t={t} /> : <Chars text={t.text} />}</WordTip>
              : [...t.text].map((c, i) => <KanjiTip key={i} c={c} reading={mainReadings(c)} />)}
          </button>
        ))}
      </div>
      {unknown.length > 0 && (
        <p className="sub small">New to you here: {unknown.map(c => <button key={c} className="inline" onClick={() => open(c)}>{c}</button>)}</p>
      )}
    </div>
  )
}
