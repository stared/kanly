import { useEffect, useMemo, useState } from 'react'
import { KANJI, ORDER, elements, gloss } from './data'
import { knewIt, learn, type Store } from './srs'
import { LEVELS, pOf, startAt, update, upcoming } from './levels'
import { Card, Glyph } from './Card'
import { Quiz, Verdict, type Result } from './Quiz'

/** Share of kanji in running text that are among the given items. */
export const coverage = (ids: Iterable<string>) => [...ids].reduce((a, id) => a + (KANJI[id]?.freq ?? 0), 0)

export function Learn({ store, setStore, open, now, autoSpeak }: { store: Store; setStore: (s: Store) => void; open: (el: string) => void; now: number; autoSpeak: boolean }) {
  const left = useMemo(() => upcoming(store, store.tau ?? 0), [store.cards, store.mu, store.T, store.tau])
  const next = left[0]
  // a part (or a rare kanji) taught early because a kanji coming up needs it: 干 before 年
  const why = next && left.slice(1).find(el => KANJI[el] && elements(KANJI[el].tree).has(next) && (!KANJI[next] || KANJI[el].freq > KANJI[next].freq * 3))

  const [answered, setAnswered] = useState<Result & { el: string } | null>(null)
  const res = answered?.el === next ? answered : null
  // right on both meaning and reading: known before, checked again in a few weeks; otherwise a new card
  const commit = () => {
    const knew = !!res?.meaning && !!res.reading
    const fit = KANJI[next] ? update(store, next, knew) : {}
    setStore(knew ? knewIt(store, next, now, fit, pOf(store, next)) : learn(store, next, now, fit))
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (next && (res || !KANJI[next]) && e.key === 'Enter') commit()
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })

  if (!store.start && !Object.keys(store.cards).length) return (
    <div className="start">
      <p>How many kanji do you know already?</p>
      <button className="next" onClick={() => setStore(startAt(store, LEVELS[0]))}>none yet</button>
      <div className="lists">
        {['JLPT', 'kentei'].map(kind => (
          <div key={kind}>
            {LEVELS.filter(l => l.label.startsWith(kind)).map(l => (
              <button key={l.label} className="next" onClick={() => setStore(startAt(store, l))}>{l.label.split(', ')[0].replace(kind + ' ', '')}<span className="n">{l.label.split(', ')[1]}</span></button>
            ))}
          </div>
        ))}
      </div>
      <p className="sub small">A starting guess. Each kanji is then a quiz: its meaning among four, then its reading among four.
        Both right, and it counts as known (it comes back once, in a few weeks, to check); otherwise it joins your reviews.
        Every answer refines the guess.</p>
    </div>
  )
  if (!next) return <div className="empty">All {ORDER.length} items learned.</div>
  return (
    <div className="learn">
      {why && <p className="why">Here as a part of {why}, coming {left.indexOf(why) === 1 ? 'next' : 'soon'}.</p>}
      {KANJI[next] && !res ? <Quiz key={next} el={next} onDone={r => setAnswered({ ...r, el: next })} /> : <>
        {res && <Verdict el={next} r={res} />}
        <Card el={next} store={store} open={open} autoSpeak={autoSpeak} />
      </>}
      <div className="actions">
        {(res || !KANJI[next]) && <button className="next" onClick={commit}>{res?.meaning && res.reading ? 'knew it, next' : 'learn it, next'} <span className="key">↵</span></button>}
        <span className="upcoming">then {left.slice(1, 9).map(el => <span key={el} title={gloss(el)} className={KANJI[el] ? '' : 'partish'}><Glyph el={el} /></span>)}</span>
      </div>
    </div>
  )
}
