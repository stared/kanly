import { useEffect, useState } from 'react'
import { KANJI, gloss } from './data'
import { answer, DAY, MIN, type Store } from './srs'
import { Glyph, Parts, Readings, Speaker, Story, treeOf } from './Card'
import { speak, spoken } from './speech'

export const dueIds = (s: Store, now: number) =>
  Object.values(s.cards).filter(c => c.due <= now).sort((a, b) => a.due - b.due).map(c => c.id)

const inTime = (ms: number) => ms < 60 * MIN ? `${Math.max(1, Math.round(ms / MIN))} min` : ms < DAY ? `${Math.round(ms / 3600_000)} h` : `${Math.round(ms / DAY)} d`

export function Review({ store, setStore, open, now, autoSpeak }: { store: Store; setStore: (s: Store) => void; open: (el: string) => void; now: number; autoSpeak: boolean }) {
  const due = dueIds(store, now)
  const [shown, setShown] = useState(false)
  const id = due[0]

  const grade = (ok: boolean) => { setStore(answer(store, id, ok, Date.now())); setShown(false) }
  useEffect(() => { if (shown && autoSpeak && id) speak(spoken(id)) }, [shown, id])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!id) return
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
        <p className="sub small">{Object.keys(store.cards).length} items learned · <a href="#learn">learn more</a></p>
      </div>
    )
  }

  const k = KANJI[id]
  const t = treeOf(id)
  return (
    <div className="review">
      <div className="progress"><span>{due.length} due</span><span>{k ? 'kanji' : 'part'}: recall its meaning{k ? ' and a reading' : ''}</span></div>
      <div className="prompt"><Glyph el={id} /></div>
      {!shown ? (
        <button className="next" onClick={() => setShown(true)}>show <span className="key">space</span></button>
      ) : (
        <div className="back">
          <h2>{gloss(id)}{spoken(id) && <Speaker text={spoken(id)} />}</h2>
          {t && <Parts t={t} store={store} open={open} />}
          <Story el={id} />
          {k && <Readings ch={id} />}
          {k && k.words.length > 0 && <p className="sub ex">{k.words.slice(0, 3).map(w => `${w.w} ${w.r}`).join(' · ')}</p>}
          <div className="grade">
            <button className="next bad" onClick={() => grade(false)}>again <span className="key">1</span></button>
            <button className="next good" onClick={() => grade(true)}>knew it <span className="key">2</span></button>
          </div>
        </div>
      )}
    </div>
  )
}
