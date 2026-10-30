import { useEffect, useMemo, useState } from 'react'
import { COMP, KANJI, ORDER, gloss, hira } from './data'
import { status, type Store } from './srs'
import { BEGINNER, mu, pKnown, temp } from './levels'
import { Card, Glyph } from './Card'

type Filter = 'all' | 'kanji' | 'parts' | 'mine'
const BY_LEVEL = Object.keys(KANJI).sort((a, b) => KANJI[a].level - KANJI[b].level)

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
  const [filter, setFilter] = useState<Filter>('all')
  const [byLevel, setByLevel] = useState(() => mu(store) > BEGINNER)
  const [sel, setSel] = useState(() => decodeURIComponent(location.hash.split('/')[1] ?? '') || ORDER[0])
  useEffect(() => { history.replaceState(null, '', '#kanji/' + sel) }, [sel])
  const list = useMemo(() => (byLevel ? BY_LEVEL : ORDER).filter(el =>
    (filter === 'all' || (filter === 'kanji' ? !!KANJI[el] : filter === 'parts' ? !KANJI[el] : !!store.cards[el])) && matches(el, q.trim())
  ), [q, filter, store, byLevel])
  const m = mu(store), t = temp(store)

  return (
    <div className="browse">
      <div className="list">
        <div className="filters">
          <input className="search" placeholder="search: 明, bright, めい" value={q} onChange={e => setQ(e.target.value)} />
          {(['all', 'kanji', 'parts', 'mine'] as Filter[]).map(f => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}
          <button className={byLevel ? 'on' : ''} onClick={() => setByLevel(!byLevel)}>by difficulty</button>
          <span className="sub small">{list.length}</span>
        </div>
        <p className="sub small">{byLevel ? 'Easiest first; the darker, the likelier you knew it before.' : 'In learning order. Parts that are not kanji are grey.'} Dots: <span className="dot known" /> known <span className="dot learning" /> learning.</p>
        <div className="cells">
          {list.slice(0, byLevel ? 2200 : 600).map(el => (
            <button key={el} className={'cell ' + status(store, el) + (KANJI[el] ? '' : ' part') + (el === sel ? ' sel' : '')} onClick={() => setSel(el)} title={gloss(el)}
              style={byLevel && !store.cards[el] ? { '--p': pKnown(el, m, t) } as React.CSSProperties : undefined}>
              <Glyph el={el} />
            </button>
          ))}
          {list.length > (byLevel ? 2200 : 600) && <span className="more">+{list.length - (byLevel ? 2200 : 600)} more; search to narrow</span>}
        </div>
      </div>
      <div className="detail">{sel && <Card key={sel} el={sel} store={store} open={open} />}</div>
    </div>
  )
}
