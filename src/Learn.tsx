import { useEffect } from 'react'
import { KANJI, ORDER, elements, gloss } from './data'
import { learn, type Store } from './srs'
import { Card, Glyph } from './Card'

/** Share of kanji in running text that are among the given items. */
export const coverage = (ids: Iterable<string>) => [...ids].reduce((a, id) => a + (KANJI[id]?.freq ?? 0), 0)

export function Learn({ store, setStore, open, now, autoSpeak }: { store: Store; setStore: (s: Store) => void; open: (el: string) => void; now: number; autoSpeak: boolean }) {
  const left = ORDER.filter(el => !store.cards[el])
  const next = left[0]
  const known = Object.keys(store.cards)
  // a part (or a rare kanji) taught early because a kanji coming up needs it: 干 before 年
  const why = next && left.slice(1, 12).find(el => KANJI[el] && elements(KANJI[el].tree).has(next) && (!KANJI[next] || KANJI[el].freq > KANJI[next].freq * 3))

  const done = () => setStore(learn(store, next, now))
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter' && next && !(e.target instanceof HTMLTextAreaElement)) done() }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })

  if (!next) return <div className="empty">All {ORDER.length} items learned.</div>
  return (
    <div className="learn">
      {why && <p className="why">Here as a part of {why}, coming {left.indexOf(why) === 1 ? 'next' : 'soon'}.</p>}
      <Card el={next} store={store} open={open} autoSpeak={autoSpeak} />
      <div className="actions">
        <button className="next" onClick={done}>next <span className="key">↵</span></button>
        <span className="upcoming">then {left.slice(1, 9).map(el => <span key={el} title={gloss(el)} className={KANJI[el] ? '' : 'partish'}><Glyph el={el} /></span>)}</span>
      </div>
    </div>
  )
}
