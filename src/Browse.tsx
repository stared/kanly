import { useMemo, useState } from 'react'
import { COMP, KANJI, ORDER, gloss, hira } from './data'
import { status, type Store } from './srs'
import { BEGINNER, lam, levelOf, mu, pOf } from './levels'
import { Glyph, KanjiTip, mainReadings } from './Card'
import { track } from './track'

const SHOW = ['kanji and parts', 'kanji only', 'non-kanji parts', 'seen by me'] as const
const SORT = ['easiest first', 'in learning order'] as const
type Show = typeof SHOW[number]
type Sort = typeof SORT[number]

/** Matches a character, a keyword or meaning, or a reading in kana. */
function matches(el: string, q: string) {
  if (!q) return true
  if (el === q || el.includes(q)) return true
  const k = KANJI[el]
  const words = [gloss(el), ...(k?.meanings ?? []), COMP[el]?.meaning ?? ''].map(s => s.toLowerCase())
  if (words.some(w => w.split(/[ ,;()]+/).some(x => x.startsWith(q.toLowerCase())))) return true
  const rq = hira(q)
  return !!k && [...k.on.map(hira), ...k.kun.map(r => r.replace(/[.-]/g, ''))].some(r => r.startsWith(rq))
}

export function Browse({ store, open }: { store: Store; open: (el: string) => void }) {
  const [q, setQ] = useState('')
  const [show, setShow] = useState<Show>(() => location.hash === '#kanji/seen' ? 'seen by me' : mu(store) > BEGINNER ? 'kanji only' : 'kanji and parts')
  const [sort, setSort] = useState<Sort>(() => mu(store) > BEGINNER ? 'easiest first' : 'in learning order')
  const byLevel = sort === 'easiest first'
  // a part is as hard as the easiest kanji using it, so parts sit next to the kanji they build
  const sorted = useMemo(() => byLevel ? [...ORDER].sort((a, b) => levelOf(a, lam(store)) - levelOf(b, lam(store))) : ORDER, [byLevel, lam(store)])
  const list = useMemo(() => sorted.filter(el =>
    (show === 'kanji and parts' || (show === 'kanji only' ? !!KANJI[el] : show === 'non-kanji parts' ? !KANJI[el] : !!store.cards[el])) && matches(el, q.trim())
  ), [q, show, store, sorted])

  return (
    <div className="browse">
      <div className="controls">
        <input className="search" placeholder="search: 明, bright, めい" value={q} onChange={e => setQ(e.target.value)} />
        <select aria-label="what to show" value={show} onChange={e => setShow(e.target.value as Show)}>
          {SHOW.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select aria-label="sort order" value={sort} onChange={e => setSort(e.target.value as Sort)}>
          {SORT.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className={'cells' + (show === 'non-kanji parts' ? ' plain' : '')}>
          {list.map(el => (
            <button key={el} className={'cell ' + status(store, el) + (KANJI[el] ? '' : ' part')} onClick={() => { track('browse', { el }); open(el) }}
              style={byLevel && KANJI[el] && !store.cards[el] ? { '--p': pOf(store, el) } as React.CSSProperties : undefined}>
              {KANJI[el] ? <KanjiTip c={el} reading={mainReadings(el)} /> : <Glyph el={el} />}
            </button>
          ))}
      </div>
    </div>
  )
}
