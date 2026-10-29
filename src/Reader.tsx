import { useEffect, useMemo, useState } from 'react'
import { KANJI, gloss } from './data'
import { status, type Store } from './srs'
import { KanjiTip, Speaker } from './Card'

const SAMPLE = `日本は東アジアにある島国で、首都は東京です。人口は約一億二千万人で、多くの人が大きな都市に住んでいます。春には桜が咲き、秋には山の木の葉が赤や黄色に変わります。`

const isHan = (c: string) => /\p{Script=Han}/u.test(c) || c === '々'
const isKana = (c: string) => /[ぁ-ゖ]/.test(c)

type Entry = [string, string, string]  // word, reading, gloss
type Token = { text: string; entry?: Entry }
type Furigana = 'new' | 'all' | 'off'

/** Index of common words; a word ending in kana (住む) is also found by its stem (住), so 住んで still matches. */
function index(words: Entry[]) {
  const exact = new Map<string, Entry>()
  const stems = new Map<string, Entry>()
  for (const e of words) {
    exact.set(e[0], e)
    const stem = e[0].replace(/[ぁ-ゖ]+$/, '')
    if (stem !== e[0] && stem && !stems.has(stem)) stems.set(stem, e)
  }
  return { exact, stems }
}

/** Greedy longest match from left to right; text without kanji passes through as is. */
function tokenize(text: string, ix: ReturnType<typeof index>): Token[] {
  const out: Token[] = []
  const chars = [...text]
  for (let i = 0; i < chars.length;) {
    if (!isHan(chars[i])) {
      const last = out[out.length - 1]
      if (last && !last.entry && !isHan(last.text[0])) last.text += chars[i]
      else out.push({ text: chars[i] })
      i++
      continue
    }
    let hit: Token | undefined
    for (let n = Math.min(8, chars.length - i); n > 0 && !hit; n--) {
      const s = chars.slice(i, i + n).join('')
      // before kana a verb or adjective stem wins over a lone kanji noun: 住んで is 住む, not 住 じゅう
      const stem = isKana(chars[i + n] ?? '') ? ix.stems.get(s) : undefined
      const e = n === 1 && stem ? stem : ix.exact.get(s) ?? stem
      if (e) hit = { text: s, entry: e }
    }
    hit ??= { text: chars[i] }
    out.push(hit)
    i += [...hit.text].length
  }
  return out
}

/** Furigana over the kanji only: 住む (すむ) shows す over 住, and the kana after it stay as written. */
function Ruby({ t }: { t: Token }) {
  const [w, r] = t.entry!
  const okurigana = w.match(/[ぁ-ゖ]+$/)?.[0] ?? ''
  const head = t.text.replace(/[ぁ-ゖ]+$/, '')
  const tail = t.text.slice(head.length)
  const base = okurigana && r.endsWith(okurigana) ? r.slice(0, r.length - okurigana.length) : r
  return <><ruby>{[...head].map((c, i) => <KanjiTip key={i} c={c} />)}<rt>{base}</rt></ruby>{tail}</>
}

export function Reader({ store, open }: { store: Store; open: (el: string) => void }) {
  const [text, setText] = useState(SAMPLE)
  const [editing, setEditing] = useState(false)
  const [words, setWords] = useState<Entry[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [furi, setFuri] = useState<Furigana>('new')
  useEffect(() => { import('./data/words.json').then(m => setWords(m.default as Entry[])) }, [])
  const ix = useMemo(() => words && index(words), [words])
  const tokens = useMemo<Token[]>(() => ix ? tokenize(text, ix) : [...text].map(c => ({ text: c })), [text, ix])

  const han = [...text].filter(c => isHan(c) && c !== '々')
  const read = (c: string) => status(store, c) !== 'new'
  const known = han.filter(read).length
  const unknown = [...new Set(han)].filter(c => !read(c) && KANJI[c])
  const showFuri = (t: Token) => furi === 'all' || (furi === 'new' && [...t.text].some(c => isHan(c) && c !== '々' && !read(c)))
  const picked = sel !== null ? tokens[sel] : undefined

  return (
    <div className="reader">
      {editing && <textarea autoFocus value={text} onChange={e => { setText(e.target.value); setSel(null) }} onBlur={() => setEditing(false)} rows={5} placeholder="Paste Japanese text" />}
      <div className="bar-line sub small">
        <span>You know {known} of {han.length} kanji here ({han.length ? Math.round(100 * known / han.length) : 0}%).</span>
        <span className="opts">
          furigana {(['new', 'all', 'off'] as Furigana[]).map(f => <button key={f} className={furi === f ? 'on' : ''} onClick={() => setFuri(f)}>{f === 'new' ? 'for new kanji' : f}</button>)}
          {!editing && <button className="inline" onClick={() => setEditing(true)}>edit text</button>}
        </span>
      </div>
      <div className="text">
        {tokens.map((t, i) => !isHan(t.text[0]) ? <span key={i}>{t.text}</span> : (
          <button key={i} className={'tok' + (i === sel ? ' sel' : '') + ([...t.text].some(c => isHan(c) && c !== '々' && !read(c)) ? ' new' : '')} onClick={() => setSel(i === sel ? null : i)}>
            {t.entry && showFuri(t) ? <Ruby t={t} /> : [...t.text].map((c, i) => <KanjiTip key={i} c={c} />)}
          </button>
        ))}
      </div>
      {picked && (
        <div className="lookup">
          <div className="lw">
            <span className="w">{picked.entry?.[0] ?? picked.text}</span>
            {picked.entry && <><span className="r">{picked.entry[1]}</span><Speaker text={picked.entry[1]} /></>}
          </div>
          {picked.entry ? <p className="g">{picked.entry[2]}</p> : <p className="g sub">not in the word list; open the kanji below</p>}
          <div className="chips">
            {[...new Set([...picked.text].filter(c => KANJI[c]))].map(c => (
              <button key={c} className={'chip wide ' + status(store, c)} onClick={() => open(c)}><span>{c}</span><small>{gloss(c)}</small></button>
            ))}
          </div>
        </div>
      )}
      {unknown.length > 0 && (
        <p className="sub small">New to you here: {unknown.map(c => <button key={c} className="inline" onClick={() => open(c)}>{c}</button>)}</p>
      )}
    </div>
  )
}
