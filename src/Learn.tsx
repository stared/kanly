import { useEffect, useMemo, useState } from 'react'
import { KANJI, ORDER } from './data'
import { meet, type Kind, type Store } from './srs'
import { LEVELS, lam, mu, pOf, startAt, update, upcoming } from './levels'
import { KINDS, ask, asks } from './words'
import { track } from './track'
import { Card, Glyph, KanjiTip, mainReadings } from './Card'
import { Quiz, type Result } from './Quiz'
import { Review } from './Review'

type Props = { store: Store; setStore: (s: Store) => void; open: (el: string) => void; autoSpeak: boolean }

/** One stream: what is asked is the item, new or seen before, with the most gain per effort (next, in levels.ts).
 * It is chosen when the one before is done and kept while it is being answered: the chances move with the clock.
 * At the bottom, the kinds of question (new, review, words), each on or off: the stream is what is left on. They are
 * there while a question is open and gone once it is answered (style.css): the room is the card's. */
export function Learn({ store, setStore, open, autoSpeak }: Props) {
  const [cur, setCur] = useState(() => ask(store, Date.now()))
  const done = (s: Store) => { setStore(s); setCur(ask(s, Date.now())) }
  /** The question on screen stays, unless its kind is the one turned off. */
  const toggle = (k: Kind) => {
    const s = { ...store, off: KINDS.filter(x => asks(store, x) === (x === k)) }
    track('kinds', { off: s.off })
    setStore(s)
    if (!cur || !asks(s, cur.kind)) setCur(ask(s, Date.now()))
  }
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
  const then = left.filter(el => el !== cur?.el).slice(0, 8)
  return (
    <div className="learn">
      {!cur ? <div className="empty">{store.off?.length ? 'Nothing to ask.' : `All ${ORDER.length} items learned.`}</div>
        : cur.kind === 'new' ? <Fresh key={cur.el} el={cur.el} store={store} open={open} autoSpeak={autoSpeak} done={done} then={then} />
        : <Review key={cur.el + cur.kind + store.cards[cur.el]?.reps} id={cur.el} byWord={cur.kind === 'words'} store={store} open={open} autoSpeak={autoSpeak} done={done} />}
      {/* a click leaves the focus where it was (a field being typed in); a key on a toggle is the toggle's alone,
          not an answer to the question above */}
      <div className="kinds" onKeyDown={e => e.stopPropagation()}>
        {KINDS.map(k => <button key={k} role="switch" aria-checked={asks(store, k)} onMouseDown={e => e.preventDefault()} onClick={() => toggle(k)}>{k}</button>)}
      </div>
    </div>
  )
}

export type Item = Omit<Props, 'setStore'> & { done: (s: Store) => void }

/** Something never seen: a kanji is a quiz first (its meaning among four, then its reading among four), then its card;
 * what the quiz got right was known before, the rest is to learn. A part is shown at once. */
function Fresh({ el, store, open, autoSpeak, done, then }: Item & { el: string; then: string[] }) {
  const [res, setRes] = useState<Result | null>(null)
  const commit = () => {
    const meaning = !!res?.meaning, reading = !!res?.reading
    const fit = KANJI[el] ? update(store, el, meaning, reading) : {}
    done(meet(store, el, Date.now(), meaning, reading, fit, pOf(store, el)))
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
