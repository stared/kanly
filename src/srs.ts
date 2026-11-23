export const MIN = 60_000
export const DAY = 86_400_000

/*
Memory, kept the way the level is: as a chance, not as a schedule.

A card has a memory time s (in days) and the moment t it was last asked. The chance its kanji is still recalled is

  p = exp(−(now − t) / s)

and an answer moves s:

  right, at recall chance p:   s → s (1 + B (1 − p))    what was nearly forgotten and still recalled gains the most;
                               at p = 0.9 it is × 2.5. The first recall after a wait makes a memory of minutes
                               one of days (S1 = 3, about three in four recalled the next day): a night's sleep
                               does what no repetition within the hour does
  wrong:                       s → s · LAPSE            relearned, so weaker but not from nothing: between S0 and half
                               a day, so that it has to be recalled after a wait once more to count as known

A kanji just learned starts at S0, ten minutes; one known at its first quiz at one to eight months, longer the surer
the level was that it would be known. There are no due dates and no steps: what is asked next, new or old, is chosen
in levels.ts from these chances, by the same weight as a new kanji.
*/
export const S0 = 10 / 1440
export const S1 = 3
export const B = 15
export const LAPSE = 0.1

export type Card = { id: string; s: number; t: number; reps: number; lapses: number }
export type LogEntry = { t: number; id: string; ok: boolean }
/** The kinds of question: a kanji or a part never seen, a card asked by itself, a card asked through a word (words.ts). */
export type Kind = 'new' | 'review' | 'words'
/** start: the level picked; mu, T: how many kanji were known before and how blurred that frontier is, fitted to answers (src/levels.ts);
 * lam: how much their order follows frequency rather than courses; tau: how wide the choice of the next kanji is;
 * off: the kinds of question turned off on the learn screen. */
export type Store = { cards: Record<string, Card>; log: LogEntry[]; start?: { mu: number; T: number }; mu?: number; T?: number; lam?: number; answers?: [string, 0 | 1][]; tau?: number; seed?: number; off?: Kind[] }
type Fit = Partial<Pick<Store, 'mu' | 'T' | 'lam' | 'answers'>>

const KEY = 'kanly/v1'

/** A card of the scheduler before this one (a due date, steps of 1 and 10 minutes, then intervals in days) as a memory:
 * it asked at the due date, taken here as the moment recall falls to 90%, at the end of the card's last interval. */
type Old = { id: string; due: number; step: number; ivl: number; reps: number; lapses: number }
const migrated = (c: Card | Old): Card => {
  if ('s' in c) return c
  const ivl = c.ivl >= 1 ? c.ivl : (c.step >= 1 ? 10 : 1) / 1440
  return { id: c.id, s: Math.max(S0, ivl / -Math.log(0.9)), t: c.due - ivl * DAY, reps: c.reps, lapses: c.lapses }
}
/** A store as saved or exported by any version. */
export const read = (s: Store): Store => ({ ...s, cards: Object.fromEntries(Object.entries(s.cards).map(([id, c]) => [id, migrated(c)])) })

export function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '')
    if (s?.cards) return read(s)
  } catch {}
  return { cards: {}, log: [] }
}

export const save = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s))

/** The chance the card's kanji is still recalled. */
export const recall = (c: Card, now: number) => Math.exp(-Math.max(0, now - c.t) / (c.s * DAY))

/** The card after an answer. */
export function asked(c: Card, ok: boolean, now: number): Card {
  const q = 1 - recall(c, now)
  if (!ok) return { ...c, s: Math.max(S0, Math.min(0.5, c.s * LAPSE)), t: now, reps: c.reps + 1, lapses: c.lapses + 1 }
  // a day's memory only for a recall after some wait: one asked again at once has shown nothing
  return { ...c, s: Math.max(c.s * (1 + B * q), S1 * Math.min(1, q / 0.1)), t: now, reps: c.reps + 1 }
}

export const learn = (s: Store, id: string, now: number, fit: Fit = {}): Store =>
  ({ ...s, ...fit, cards: { ...s.cards, [id]: { id, s: S0, t: now, reps: 0, lapses: 0 } } })

/** Known at its first quiz: a memory of one to eight months, longer the surer the level was (p) that it would be known,
 * and spread at random, as nothing says how long ago it was learned: hundreds known on one day then do not all come back on another. */
export const knewIt = (s: Store, id: string, now: number, fit: Fit = {}, p = 0.5): Store =>
  ({ ...s, ...fit, cards: { ...s.cards, [id]: { id, s: (30 + 120 * p) * (0.75 + Math.random()), t: now, reps: 1, lapses: 0 } } })

export const answer = (s: Store, id: string, ok: boolean, now: number): Store =>
  ({ ...s, cards: { ...s.cards, [id]: asked(s.cards[id], ok, now) }, log: [...s.log, { t: now, id, ok }] })

export type Status = 'new' | 'learning' | 'known'
/** Learning while the memory is shorter than a day, known from then on. */
export const status = (s: Store, id: string): Status => {
  const c = s.cards[id]
  return !c ? 'new' : c.s >= 1 ? 'known' : 'learning'
}
