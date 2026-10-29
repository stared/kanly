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

/** What to say for a kanji: its most used on-reading and kun-reading, if each is common (≥ 10% of words). */
export function spoken(ch: string): string {
  const k = KANJI[ch]
  if (!k) return ''
  const n = Object.values(k.usage).reduce((a, c) => a + c, 0) || 1
  const onSet = new Set(k.on.map(hira))
  const top = Object.entries(k.usage).filter(([r, c]) => r !== '(irregular)' && c / n >= 0.1)
  const on = top.find(([r]) => onSet.has(r))?.[0] ?? (top.length ? undefined : k.on[0] && hira(k.on[0]))
  const kun = top.find(([r]) => !onSet.has(r))?.[0] ?? (top.length || on ? undefined : k.kun[0])
  return [on && kata(on), kun?.replace(/[.-]/g, '')].filter(Boolean).join('、')
}
