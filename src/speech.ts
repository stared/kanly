import { KANJI, hira, kata } from './data'

const KEY = 'kanly/autoSpeak'
export const loadAutoSpeak = () => { try { return localStorage.getItem(KEY) !== '0' } catch { return true } }
export const saveAutoSpeak = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0') } catch {} }

export function speak(text: string) {
  if (!('speechSynthesis' in window) || !text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  u.rate = 0.85
  speechSynthesis.speak(u)
}

/** What to say for a kanji: the word it makes on its own (月 つき), else its first reading. */
export function spoken(ch: string): string {
  const k = KANJI[ch]
  if (!k) return ''
  if (k.alone) return k.alone.r
  const r = k.readings[0]?.r ?? ''
  return /^[ァ-ヶー]+$/.test(r) ? r : r.replace('.', '')
}
