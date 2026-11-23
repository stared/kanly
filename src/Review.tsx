import { useEffect, useMemo, useState } from 'react'
import { KANJI } from './data'
import { answer, recall } from './srs'
import { Card, Glyph } from './Card'
import { Quiz, type Result } from './Quiz'
import { WordQuiz } from './WordQuiz'
import { reviewWord } from './words'
import { track } from './track'
import type { Item } from './Learn'

/** A card again. A kanji whose memory has reached a day is asked through one of its words, typed (words.ts; byWord,
 * unless words are turned off): that is the word's own screen to the end, a word having two kanji or more and so no
 * one card to end on. A kanji with a shorter memory is asked by itself, meaning among four then reading among four;
 * both pass only with meaning and reading right. A part is shown and graded by the learner. A kanji answered, a part
 * shown: its card, whole, as when it was new. */
export function Review({ id, byWord, store, open, autoSpeak, done }: Item & { id: string; byWord: boolean }) {
  const word = useMemo(() => byWord ? reviewWord(store, id) : undefined, [id, byWord])
  const [res, setRes] = useState<Result | null>(null)
  const [shown, setShown] = useState(false)
  const k = KANJI[id]
  const passed = !!res?.meaning && !!res.reading
  const grade = (ok: boolean) => { if (!k) track('grade', { el: id, ok }); done(answer(store, id, ok, Date.now())) }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (word || e.repeat) return  // typed: the word's own form takes the keys
      if (k) { if (res && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); grade(passed) } return }
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true) }
      else if (shown && (e.key === '1' || e.key === 'ArrowLeft')) grade(false)
      else if (shown && (e.key === '2' || e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); grade(true) }
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })
  const card = store.cards[id]
  if (k && word) return <div className="review"><WordQuiz el={id} w={word} card={card} open={open} autoSpeak={autoSpeak} onDone={grade} /></div>
  if (k && !res) return <div className="review"><Quiz el={id} unknown="forgot" onDone={r => { track('quiz', { in: 'review', el: id, ...r, card, p: recall(card, Date.now()) }); setRes(r) }} /></div>
  if (!k && !shown) return (
    <div className="review">
      <div className="prompt"><Glyph el={id} /></div>
      <button className="next" onClick={() => setShown(true)}>show <span className="key">space</span></button>
    </div>
  )
  return (
    <>
      <div className="revealed"><Card el={id} store={store} open={open} autoSpeak={autoSpeak} got={res ?? undefined} /></div>
      <div className="actions">
        {k ? <button className={'next ' + (passed ? 'good' : 'bad')} onClick={() => grade(passed)}>next <span className="key">↵</span></button> : <>
          <button className="next bad" onClick={() => grade(false)}>again <span className="key">1</span></button>
          <button className="next good" onClick={() => grade(true)}>knew it <span className="key">2</span></button>
        </>}
      </div>
    </>
  )
}
