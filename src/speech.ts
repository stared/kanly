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

/** What to say for a kanji: the word it makes on its own (月 つき), else its most used reading. */
export function spoken(ch: string): string {
  const k = KANJI[ch]
  if (!k) return ''
  const alone = k.words.find(w => w.w === ch)
  if (alone) return alone.r
  const onSet = new Set(k.on.map(hira))
  const [top] = Object.entries(k.usage).filter(([r]) => r !== '(irregular)').sort((a, b) => b[1] - a[1])
  const r = top?.[0] ?? (k.on[0] ? hira(k.on[0]) : k.kun[0] ?? '')
  return onSet.has(r) ? kata(r) : r.replace(/[.-]/g, '')
}
