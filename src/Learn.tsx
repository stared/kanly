import { useEffect } from 'react'
import { KANJI, ORDER, gloss } from './data'
import { learn, type Store } from './srs'
import { Card, Glyph } from './Card'

/** Share of kanji in running text that are among the given items. */
export const coverage = (ids: Iterable<string>) => [...ids].reduce((a, id) => a + (KANJI[id]?.freq ?? 0), 0)

export function Learn({ store, setStore, open, now, autoSpeak }: { store: Store; setStore: (s: Store) => void; open: (el: string) => void; now: number; autoSpeak: boolean }) {
  const left = ORDER.filter(el => !store.cards[el])
  const next = left[0]
  const known = Object.keys(store.cards)

  const done = () => setStore(learn(store, next, now))
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter' && next && !(e.target instanceof HTMLTextAreaElement)) done() }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })

  if (!next) return <div className="empty">All {ORDER.length} items learned.</div>
  return (
    <div className="learn">
      {!KANJI[next] && <p className="new-part">A part first: it appears in the kanji coming up.</p>}
      <Card el={next} store={store} open={open} autoSpeak={autoSpeak} />
      <div className="actions">
        <button className="next" onClick={done}>next <span className="key">↵</span></button>
        <span className="upcoming">then {left.slice(1, 9).map(el => <span key={el} title={gloss(el)} className={KANJI[el] ? '' : 'partish'}><Glyph el={el} /></span>)}</span>
      </div>
    </div>
  )
}
