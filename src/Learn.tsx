import { useEffect, useMemo } from 'react'
import { KANJI, ORDER, elements, gloss } from './data'
import { knewIt, learn, type Store } from './srs'
import { update, upcoming } from './levels'
import { Card, Glyph } from './Card'

/** Share of kanji in running text that are among the given items. */
export const coverage = (ids: Iterable<string>) => [...ids].reduce((a, id) => a + (KANJI[id]?.freq ?? 0), 0)

export function Learn({ store, setStore, open, now, autoSpeak }: { store: Store; setStore: (s: Store) => void; open: (el: string) => void; now: number; autoSpeak: boolean }) {
  const left = useMemo(() => upcoming(store, store.tau ?? 0), [store.cards, store.mu, store.tau])
  const next = left[0]
  // a part (or a rare kanji) taught early because a kanji coming up needs it: 干 before 年
  const why = next && left.slice(1).find(el => KANJI[el] && elements(KANJI[el].tree).has(next) && (!KANJI[next] || KANJI[el].freq > KANJI[next].freq * 3))

  const done = () => setStore(learn(store, next, now, KANJI[next] ? update(store, next, false) : undefined))
  const knew = () => setStore(knewIt(store, next, now, KANJI[next] ? update(store, next, true) : store.mu ?? 0))
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!next || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Enter') done()
      if (e.key === 'k') knew()
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })

  if (!next) return <div className="empty">All {ORDER.length} items learned.</div>
  return (
    <div className="learn">
      {why && <p className="why">Here as a part of {why}, coming {left.indexOf(why) === 1 ? 'next' : 'soon'}.</p>}
      <Card el={next} store={store} open={open} autoSpeak={autoSpeak} />
      <div className="actions">
        <button className="next quiet" onClick={knew}>I know it <span className="key">K</span></button>
        <button className="next" onClick={done}>new to me <span className="key">↵</span></button>
        <span className="upcoming">then {left.slice(1, 9).map(el => <span key={el} title={gloss(el)} className={KANJI[el] ? '' : 'partish'}><Glyph el={el} /></span>)}</span>
      </div>
    </div>
  )
}
