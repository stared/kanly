import { useEffect, useMemo, useState } from 'react'
import { KANJI, ORDER } from './data'
import { knewIt, learn, type Store } from './srs'
import { LEVELS, lam, mu, next, pOf, startAt, update, upcoming } from './levels'
import { track } from './track'
import { Card, Glyph, KanjiTip, mainReadings } from './Card'
import { Quiz, type Result } from './Quiz'
import { Review } from './Review'

type Props = { store: Store; setStore: (s: Store) => void; open: (el: string) => void; autoSpeak: boolean }

/** One stream: what is asked is the item, new or seen before, with the most gain per effort (next, in levels.ts).
 * It is chosen when the one before is done and kept while it is being answered: the chances move with the clock. */
export function Learn({ store, setStore, open, autoSpeak }: Props) {
  const [cur, setCur] = useState(() => next(store, Date.now()))
  const done = (s: Store) => { setStore(s); setCur(next(s, Date.now())) }
  const left = useMemo(() => upcoming(store, store.tau ?? 0), [store.cards, store.mu, store.T, store.tau])

  if (!store.start && !Object.keys(store.cards).length) return (
    <div className="start">
      <p>How many kanji do you know already?</p>
      <button className="next" onClick={() => done(startAt(store, LEVELS[0]))}>none yet</button>
      <div className="lists">
        {['JLPT', 'kentei'].map(kind => (
          <div key={kind}>
            {LEVELS.filter(l => l.label.startsWith(kind)).map(l => (
              <button key={l.label} className="next" onClick={() => done(startAt(store, l))}>{l.label.split(', ')[0].replace(kind + ' ', '')}<span className="n">{l.label.split(', ')[1]}</span></button>
            ))}
          </div>
        ))}
      </div>
      <p className="sub small">A rough guess is fine. You'll be asked each kanji's meaning and reading.</p>
      <p className="sub small">Can't read ひらがな (hiragana) or カタカナ (katakana) yet?
        Learn them with <a href="https://p.migdal.pl/vibe-japanese/">my mnemonics app</a>.</p>
    </div>
  )
  if (!cur) return <div className="empty">All {ORDER.length} items learned.</div>
  const then = left.filter(el => el !== cur.el).slice(0, 8)
  return (
    <div className="learn">
      {cur.seen
        ? <Review key={cur.el + store.cards[cur.el]?.reps} id={cur.el} store={store} open={open} autoSpeak={autoSpeak} done={done} />
        : <Fresh key={cur.el} el={cur.el} store={store} open={open} autoSpeak={autoSpeak} done={done} then={then} />}
    </div>
  )
}

export type Item = Omit<Props, 'setStore'> & { done: (s: Store) => void }

/** Something never seen: a kanji is a quiz first (its meaning among four, then its reading among four), then its card;
 * right on both, it was known before; otherwise it is a card to learn. A part is shown at once. */
function Fresh({ el, store, open, autoSpeak, done, then }: Item & { el: string; then: string[] }) {
  const [res, setRes] = useState<Result | null>(null)
  const commit = () => {
    const now = Date.now(), knew = !!res?.meaning && !!res.reading
    const fit = KANJI[el] ? update(store, el, knew) : {}
    done(knew ? knewIt(store, el, now, fit, pOf(store, el)) : learn(store, el, now, fit))
  }
  const shown = !!res || !KANJI[el]
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (shown && e.key === 'Enter' && !e.repeat) commit() }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })
  return (
    <>
      {shown
        ? <div className="revealed"><Card el={el} store={store} open={open} autoSpeak={autoSpeak} got={res ?? undefined} /></div>
        : <Quiz el={el} onDone={r => { track('quiz', { in: 'learn', el, ...r, p: pOf(store, el), mu: mu(store), lam: lam(store) }); setRes(r) }} />}
      <div className="actions">
        {shown && <button className="next" onClick={commit}>next <span className="key">↵</span></button>}
        <span className="upcoming">then {then.map(x => <span key={x} className={KANJI[x] ? '' : 'partish'}>{KANJI[x] ? <KanjiTip c={x} reading={mainReadings(x)} /> : <Glyph el={x} />}</span>)}</span>
      </div>
    </>
  )
}
