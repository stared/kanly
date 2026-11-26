import { useEffect, useRef, useState } from 'react'
import type { Word } from './data'
import type { Card as SrsCard } from './srs'
import { WordRow } from './Card'
import { speak } from './speech'
import { track } from './track'
import { entries, glosses, meant, readAs } from './words'

/** A word in kanji; its reading (kana or romaji) and its meaning are typed, then checked: each field turns green or
 * red where it stands and moves the kanji's memory of that (srs.ts), and the word as its card has it appears below. The screen stays the word's: a word has two
 * kanji or more and so no one card to go to; each kanji in the word below shows what it is there under a mouse and
 * opens its card when clicked. A meaning marked wrong can be overruled, in the field itself (a synonym the gloss does
 * not list). Enter moves from the reading to the meaning, checks, then goes on. */
export function WordQuiz({ el, w, card, open, autoSpeak, onDone }: { el: string; w: Word; card: SrsCard; open: (el: string) => void; autoSpeak: boolean; onDone: (meaning: boolean, reading: boolean) => void }) {
  const [reading, setReading] = useState('')
  const [meaning, setMeaning] = useState('')
  const [res, setRes] = useState<{ w: Word; reading: boolean; meaning: boolean } | null>(null)
  const meaningRef = useRef<HTMLInputElement>(null)
  const t0 = useRef(Date.now())
  const passed = !!res && res.reading && res.meaning

  const check = () => {
    const ws = entries(el, w)
    const hit = readAs(reading, ws)  // 紅葉 is こうよう and もみじ: the one typed is the one whose meaning is asked
    const shown = hit ?? w
    const r = { w: shown, reading: !!hit, meaning: meant(meaning, ...glosses(shown)) }
    track('quiz', { in: 'review', el, word: w.w, typed: [reading, meaning], reading: r.reading, meaning: r.meaning, ms: [Date.now() - t0.current], card })
    setRes(r)
    if (autoSpeak) speak(shown.r)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()  // a phone's keyboard goes, the answer shows
  }
  const overrule = () => { track('overrule', { el, word: w.w, typed: meaning }); setRes(r => r && { ...r, meaning: true }) }
  useEffect(() => {
    if (!res) return
    // Enter goes on: pressed anew (a held key would run through the cards to come), and not on a button, which it
    // presses (my meaning was right), nor under a card opened from the word
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || (e.target as Element).closest?.('button, a, .peek') || document.querySelector('.peek')) return
      e.preventDefault()
      onDone(res.meaning, res.reading)
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })

  const field = (ok?: boolean) => 'field' + (ok === undefined ? '' : ok ? ' right' : ' wrong')
  return (
    <form className={'quiz word-quiz' + (res ? ' answered' : '')} onSubmit={e => { e.preventDefault(); if (!res) check() }}>
      <div className="prompt word" style={{ '--n': [...w.w].length } as React.CSSProperties}>{w.w}</div>
      <p className="sub">How is it read, and what does it mean?</p>
      <div className="choices">
        {/* in kana or romaji; kanji (an input method's conversion) is not a reading, and the browser says so */}
        <input className={field(res?.reading)} value={reading} onChange={e => setReading(e.target.value)} readOnly={!!res} autoFocus
          placeholder="reading: kana or romaji" aria-label="reading, in kana or romaji" pattern="[^一-鿿]*" title="in kana or romaji, not kanji"
          lang="ja" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="next"
          onKeyDown={e => { if (e.key === 'Enter' && !res && !e.nativeEvent.isComposing) { e.preventDefault(); if (!e.repeat) meaningRef.current?.focus() } }} />
        <div className="ans">
          <input ref={meaningRef} className={field(res?.meaning)} value={meaning} onChange={e => setMeaning(e.target.value)} readOnly={!!res}
            placeholder="meaning" aria-label="meaning, in English" autoCapitalize="none" autoComplete="off" enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter' && e.repeat) e.preventDefault() }} />
          {res && !res.meaning && meaning.trim() && <button className="overrule" type="button" onClick={overrule} aria-label="my meaning was right">I was right</button>}
        </div>
      </div>
      {/* no kanji of it marked: on a card the red one is the card's own, and here there is no card */}
      {res && <ul className="words asked"><WordRow w={res.w} ch="" open={open} /></ul>}
      <div className="grade">
        {!res ? <button className="next" type="submit">check <span className="key">↵</span></button>
          : <button className={'next ' + (passed ? 'good' : 'bad')} type="button" onClick={() => onDone(res.meaning, res.reading)}>next <span className="key">↵</span></button>}
      </div>
    </form>
  )
}
