import { KANJI, hira, kata } from './data'

const KEY = 'kanly/autoSpeak'
export const loadAutoSpeak = () => { try { return localStorage.getItem(KEY) !== '0' } catch { return true } }
export const saveAutoSpeak = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0') } catch {} }

// A Japanese voice installed on the device (Kyoko, O-Ren on a Mac) works offline; the browser's own online voices
// (Google 日本語 in Chrome) need a connection, so they are taken only when there is no local one.
let voice: SpeechSynthesisVoice | undefined
const pick = () => {
  const ja = speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').startsWith('ja'))
  voice = ja.find(v => v.localService) ?? ja[0]
}
if ('speechSynthesis' in window) { pick(); speechSynthesis.addEventListener('voiceschanged', pick) }

export function speak(text: string) {
  if (!('speechSynthesis' in window) || !text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  if (voice) u.voice = voice
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

/** Say it when the pointer rests on it a moment, not when it only passes over. */
let timer: ReturnType<typeof setTimeout> | undefined
export function hoverSay(text: string | null) {
  clearTimeout(timer)
  if (text) timer = setTimeout(() => speak(text), 250)
}
