import { useEffect, useState } from 'react'
import { KANJI, gloss } from './data'
import { answer, DAY, MIN, type Store } from './srs'
import { Glyph, Parts, Readings, Story, treeOf } from './Card'
import { Quiz, type Result } from './Quiz'
import { speak, spoken } from './speech'

export const dueIds = (s: Store, now: number) =>
  Object.values(s.cards).filter(c => c.due <= now).sort((a, b) => a.due - b.due).map(c => c.id)

const inTime = (ms: number) => ms < 60 * MIN ? `${Math.max(1, Math.round(ms / MIN))} min` : ms < DAY ? `${Math.round(ms / 3600_000)} h` : `${Math.round(ms / DAY)} d`

export function Review({ store, setStore, open, now, autoSpeak }: { store: Store; setStore: (s: Store) => void; open: (el: string) => void; now: number; autoSpeak: boolean }) {
  const due = dueIds(store, now)
  const [shown, setShown] = useState(false)
  const id = due[0]
  // a kanji is quizzed (meaning among 4, then reading among 4) and passes only with both right; a part is self-graded
  const [quizzed, setQuizzed] = useState<Result & { id: string } | null>(null)
  const res = quizzed?.id === id ? quizzed : null
  const passed = !!res?.meaning && !!res.reading

  const grade = (ok: boolean) => { setStore(answer(store, id, ok, Date.now())); setShown(false) }
  useEffect(() => { if ((shown || res) && autoSpeak && id) speak(spoken(id)) }, [shown, id, !!res])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!id) return
      if (KANJI[id]) { if (res && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); grade(passed) } return }
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true) }
      else if (shown && (e.key === '1' || e.key === 'ArrowLeft')) grade(false)
      else if (shown && (e.key === '2' || e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); grade(true) }
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })

  if (!id) {
    const next = Object.values(store.cards).sort((a, b) => a.due - b.due)[0]
    return (
      <div className="empty">
        {next ? <>Nothing due. Next review in {inTime(next.due - now)}.</> : <>Nothing to review yet. Learn a few kanji first.</>}
        <p className="sub small"><a href="#learn">Learn more</a></p>
      </div>
    )
  }

  const k = KANJI[id]
  const t = treeOf(id)
  if (k && !res) return (
    <div className="review">
      <Quiz key={id} el={id} unknown="forgot" onDone={r => setQuizzed({ ...r, id })} />
    </div>
  )
  if (k && res) return (
    <div className="review">
      <div className="quiz">
      <div className="prompt"><Glyph el={id} /></div>
      </div>
      <div className="back">
        <h2 className={res.meaning ? 'got' : ''}>{gloss(id)}</h2>
        {t && <Parts t={t} store={store} open={open} />}
        <Story el={id} />
        <Readings ch={id} className={res.reading ? 'got' : ''} />
        <div className="grade">
          <button className={'next ' + (passed ? 'good' : 'bad')} onClick={() => grade(passed)}>{passed ? 'next' : 'again soon, next'} <span className="key">↵</span></button>
        </div>
      </div>
    </div>
  )
  return (
    <div className="review">
      <p className="progress">{due.length} due. Recall the meaning{k ? ' and a reading' : ''}.</p>
      <div className="prompt"><Glyph el={id} /></div>
      {!shown ? (
        <button className="next" onClick={() => setShown(true)}>show <span className="key">space</span></button>
      ) : (
        <div className="back">
          <h2>{gloss(id)}</h2>
          {t && <Parts t={t} store={store} open={open} />}
          <Story el={id} />
          {k && <Readings ch={id} />}
          <div className="grade">
            <button className="next bad" onClick={() => grade(false)}>again <span className="key">1</span></button>
            <button className="next good" onClick={() => grade(true)}>knew it <span className="key">2</span></button>
          </div>
        </div>
      )}
    </div>
  )
}
