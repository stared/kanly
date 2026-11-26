import { useMemo, useState } from 'react'
import { COMP, KANJI, ORDER, gloss, reads } from './data'
import type { Store } from './srs'
import { BEGINNER, lam, levelOf, marks, mu, pOf } from './levels'
import { Glyph, KanjiTip, mainReadings } from './Card'
import { track } from './track'

const SHOW = ['kanji and parts', 'kanji only', 'non-kanji parts', 'seen by me'] as const
const SORT = ['easiest first', 'in learning order'] as const
type Show = typeof SHOW[number]
type Sort = typeof SORT[number]

/** What a search looks through: every meaning the card or the dictionary gives, as terms (day; sun is two), and the readings. */
const INDEX = new Map<string, { terms: string[]; readings: string[] }>()
function indexed(el: string) {
  let x = INDEX.get(el)
  if (!x) {
    const k = KANJI[el], c = COMP[el]
    const said = [gloss(el), ...(k?.also ?? []), ...(k?.means ?? []).map(m => m[0]), ...(k?.meanings ?? []), c?.meaning ?? '']
    x = {
      // as plain words: each term (day; sun is two), and each meaning as given (day sun), for one typed off the card
      terms: [...new Set(said.flatMap(s => [s, ...s.split(/[;,]/)]).map(s => words(s.toLowerCase()).join(' ')).filter(Boolean))],
      readings: [...(k?.on ?? c?.on ?? []), ...(k?.kun ?? c?.kun ?? [])].map(r => r.replace(/^-|-$/g, '')),
    }
    INDEX.set(el, x)
  }
  return x
}

/** How well an item answers a search, 0 for not at all, best first:
 * 6 the character itself, typed or pasted, alone or in a word (明日 finds 明 and 日; kana in a search is a reading, not the part マ);
 * 5 a meaning in full (sun), 4 a reading in full, in kana or romaji (めい, mei; あか or あかるい for あか.るい);
 * 3 whole words of a meaning (rising sun), 2 the start of one (brig, sunk), 1 the start of a reading (me). */
export function rank(el: string, query: string): number {
  // full-width letters as typed through an input method; to eat, the sun: eat, sun
  const q = query.normalize('NFKC').trim().toLowerCase().replace(/^(to|a|an|the)\s+(?=\S)/, '')
  if (!q) return 1
  if (el.toLowerCase() === q || (!/^[ぁ-ゖァ-ヶ]$/.test(el) && [...q].includes(el))) return 6
  const { terms, readings } = indexed(el)
  // a meaning is asked for in plain letters only: kō is a reading, and must not find every word in k
  const phrase = /^[\x20-\x7e]+$/.test(q) ? words(q).join(' ') : ''
  if (phrase && terms.includes(phrase)) return 5
  if (readings.some(r => reads(q, r) || (r.includes('.') && reads(q, r.split('.')[0])))) return 4
  if (phrase && terms.some(t => ` ${t} `.includes(` ${phrase} `))) return 3
  if (phrase && terms.some(t => ` ${t}`.includes(` ${phrase}`))) return 2
  return readings.some(r => reads(q, r, true)) ? 1 : 0
}
function words(s: string) { return s.split(/[^a-z0-9']+/).filter(Boolean) }

export function Browse({ store, open }: { store: Store; open: (el: string) => void }) {
  const [q, setQ] = useState('')
  const [show, setShow] = useState<Show>(() => location.hash === '#kanji/seen' ? 'seen by me' : mu(store) > BEGINNER ? 'kanji only' : 'kanji and parts')
  const [sort, setSort] = useState<Sort>(() => mu(store) > BEGINNER ? 'easiest first' : 'in learning order')
  const byLevel = sort === 'easiest first'
  // a part is as hard as the easiest kanji using it, so parts sit next to the kanji they build
  const sorted = useMemo(() => byLevel ? [...ORDER].sort((a, b) => levelOf(a, lam(store)) - levelOf(b, lam(store))) : ORDER, [byLevel, lam(store)])
  // the best answers first, each rank in the order chosen; a character that was typed shows whatever the filter says
  const list = useMemo(() => {
    const shown = (el: string) => show === 'kanji and parts' || (show === 'kanji only' ? !!KANJI[el] : show === 'non-kanji parts' ? !KANJI[el] : !!store.cards[el])
    if (!q.trim()) return sorted.filter(shown)
    return sorted.map(el => [el, rank(el, q)] as const).filter(([el, r]) => r === 6 || (r > 0 && shown(el))).sort((a, b) => b[1] - a[1]).map(([el]) => el)
  }, [q, show, store, sorted])

  return (
    <div className="browse">
      <div className="controls">
        <input className="search" placeholder="search: 明, bright, めい, mei" value={q} onChange={e => setQ(e.target.value)}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="search" onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} aria-label="search kanji by character, meaning or reading" />
        <select aria-label="what to show" value={show} onChange={e => setShow(e.target.value as Show)}>
          {SHOW.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select aria-label="sort order" value={sort} onChange={e => setSort(e.target.value as Sort)}>
          {SORT.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {q.trim() && !list.length && <p className="sub none">Nothing found for “{q.trim()}”{show === 'kanji and parts' ? '' : ` in “${show}”`}.</p>}
      <div className={'cells' + (show === 'non-kanji parts' ? ' plain' : '')}>
          {list.map(el => (
            <button key={el} className={'cell ' + marks(store, el) + (KANJI[el] ? '' : ' part')} onClick={() => { track('browse', { el }); open(el) }}
              style={byLevel && KANJI[el] && !store.cards[el] ? { '--p': pOf(store, el) } as React.CSSProperties : undefined}>
              {KANJI[el] ? <KanjiTip c={el} reading={mainReadings(el)} /> : <Glyph el={el} />}
            </button>
          ))}
      </div>
    </div>
  )
}
