import { useEffect, useMemo, useState } from 'react'
import { KANJI, gloss } from './data'
import { answer, recall } from './srs'
import { Glyph, Parts, Readings, Story, treeOf } from './Card'
import { Quiz, type Result } from './Quiz'
import { WordQuiz } from './WordQuiz'
import { reviewWord } from './words'
import { speak, spoken } from './speech'
import { track } from './track'
import type { Item } from './Learn'

/** A card again. A kanji whose memory has reached a day is asked through one of its words, typed (words.ts; byWord,
 * unless words are turned off); a shorter one by itself, meaning among four then reading among four; both pass only
 * with meaning and reading right. A part is shown and graded by the learner. */
export function Review({ id, byWord, store, open, autoSpeak, done }: Item & { id: string; byWord: boolean }) {
  const word = useMemo(() => byWord ? reviewWord(store, id) : undefined, [id, byWord])
  const [res, setRes] = useState<Result | null>(null)
  const [shown, setShown] = useState(false)
  const k = KANJI[id], t = treeOf(id)
  const passed = !!res?.meaning && !!res.reading
  const grade = (ok: boolean) => { if (!k) track('grade', { el: id, ok }); done(answer(store, id, ok, Date.now())) }
  useEffect(() => { if ((shown || res) && autoSpeak && !word) speak(spoken(id)) }, [shown, !!res])
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
  if (k && res) return (
    <div className="review">
      <div className="quiz"><div className="prompt"><Glyph el={id} /></div></div>
      <div className="back">
        <h2 className={res.meaning ? 'got' : ''}>{gloss(id)}</h2>
        {t && <Parts t={t} store={store} open={open} />}
        <Story el={id} />
        <Readings ch={id} className={res.reading ? 'got' : ''} />
        <div className="grade"><button className={'next ' + (passed ? 'good' : 'bad')} onClick={() => grade(passed)}>{passed ? 'next' : 'again soon, next'} <span className="key">↵</span></button></div>
      </div>
    </div>
  )
  return (
    <div className="review">
      <div className="prompt"><Glyph el={id} /></div>
      {!shown ? <button className="next" onClick={() => setShown(true)}>show <span className="key">space</span></button> : (
        <div className="back">
          <h2>{gloss(id)}</h2>
          {t && <Parts t={t} store={store} open={open} />}
          <Story el={id} />
          <div className="grade">
            <button className="next bad" onClick={() => grade(false)}>again <span className="key">1</span></button>
            <button className="next good" onClick={() => grade(true)}>knew it <span className="key">2</span></button>
          </div>
        </div>
      )}
    </div>
  )
}
