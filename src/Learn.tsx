import { useEffect, useMemo, useState } from 'react'
import { KANJI, ORDER, elements, gloss } from './data'
import { knewIt, learn, type Store } from './srs'
import { LEVELS, lam, mu, pOf, startAt, update, upcoming } from './levels'
import { track } from './track'
import { Card, Glyph, KanjiTip, mainReadings } from './Card'
import { Quiz, type Result } from './Quiz'

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
      <p className="sub small">A rough guess is fine. You'll be asked each kanji's meaning and reading.</p>
      <p className="sub small">Can't read ひらがな (hiragana) or カタカナ (katakana) yet?
        Learn them with <a href="https://p.migdal.pl/vibe-japanese/">my mnemonics app</a>.</p>
    </div>
  )
  if (!next) return <div className="empty">All {ORDER.length} items learned.</div>
  return (
    <div className="learn">
      {why && <p className="why">Here as a part of {why}, coming {left.indexOf(why) === 1 ? 'next' : 'soon'}.</p>}
      {KANJI[next] && !res ? <Quiz key={next} el={next} onDone={r => { track('quiz', { in: 'learn', el: next, ...r, p: pOf(store, next), mu: mu(store), lam: lam(store) }); setAnswered({ ...r, el: next }) }} /> : (
        <div className="revealed">
          <Card el={next} store={store} open={open} autoSpeak={autoSpeak} got={res ?? undefined} />
        </div>
      )}
      <div className="actions">
        {(res || !KANJI[next]) && <button className="next" onClick={commit}>{res?.meaning && res.reading ? 'knew it, next' : 'learn it, next'} <span className="key">↵</span></button>}
        <span className="upcoming">then {left.slice(1, 9).map(el => <span key={el} className={KANJI[el] ? '' : 'partish'}>{KANJI[el] ? <KanjiTip c={el} reading={mainReadings(el)} /> : <Glyph el={el} />}</span>)}</span>
      </div>
    </div>
  )
}
