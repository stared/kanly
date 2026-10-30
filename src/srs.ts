export const MIN = 60_000
export const DAY = 86_400_000
const STEPS = [1, 10]

export type Card = { id: string; due: number; step: number; ivl: number; ease: number; reps: number; lapses: number }
export type LogEntry = { t: number; id: string; ok: boolean }
/** start: the level picked; mu, T: how many kanji were known before and how blurred that frontier is, fitted to answers (src/levels.ts);
 * tau: how wide the choice of the next kanji is. */
export type Store = { cards: Record<string, Card>; log: LogEntry[]; start?: { mu: number; T: number }; mu?: number; T?: number; answers?: [string, 0 | 1][]; tau?: number; seed?: number }
type Fit = Partial<Pick<Store, 'mu' | 'T' | 'answers'>>

const KEY = 'kanly/v1'

export function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '')
    if (s?.cards) return s
  } catch {}
  return { cards: {}, log: [] }
}

export const save = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s))

export const newCard = (id: string, now: number): Card => ({ id, due: now + STEPS[0] * MIN, step: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0 })

export function schedule(c: Card, ok: boolean, now: number): Card {
  if (!ok) return { ...c, step: 0, ivl: 0, ease: Math.max(1.3, c.ease - 0.2), lapses: c.lapses + 1, reps: c.reps + 1, due: now + STEPS[0] * MIN }
  if (c.ivl === 0) {
    const step = c.step + 1
    if (step < STEPS.length) return { ...c, step, reps: c.reps + 1, due: now + STEPS[step] * MIN }
    return { ...c, step, ivl: 1, reps: c.reps + 1, due: now + DAY - 4 * 3600_000 }
  }
  const ivl = Math.max(c.ivl + 1, Math.round(c.ivl * c.ease))
  return { ...c, ivl, reps: c.reps + 1, due: now + ivl * DAY - 4 * 3600_000 }
}

export const learn = (s: Store, id: string, now: number, fit: Fit = {}): Store =>
  ({ ...s, ...fit, cards: { ...s.cards, [id]: newCard(id, now) } })

/** Known before: checked again in 2 weeks to 4 months (sooner the less sure we were it would be known),
 * spread so that tapping through hundreds of known kanji does not bring them all back on the same day. */
export const knewIt = (s: Store, id: string, now: number, fit: Fit = {}, p = 0.5): Store => {
  const ivl = Math.round((14 + 60 * p) * (0.75 + Math.random()))
  return { ...s, ...fit, cards: { ...s.cards, [id]: { ...newCard(id, now), step: STEPS.length, ivl, reps: 1, due: now + ivl * DAY } } }
}

export const answer = (s: Store, id: string, ok: boolean, now: number): Store =>
  ({ ...s, cards: { ...s.cards, [id]: schedule(s.cards[id], ok, now) }, log: [...s.log, { t: now, id, ok }] })

export type Status = 'new' | 'learning' | 'known'
export const status = (s: Store, id: string): Status => {
  const c = s.cards[id]
  return !c ? 'new' : c.ivl >= 1 ? 'known' : 'learning'
}
