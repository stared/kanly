import { KANJI } from './data'

export const MIN = 60_000
export const DAY = 86_400_000

/*
Memory, kept the way the level is: as a chance, not as a schedule.

A memory has a time s (in days) and the moment t it was last asked. A kanji's card has two, one of its meaning and
one of its reading, since one is often known without the other; a part's card has the meaning alone. The chance a
memory still holds is

  p = exp(−(now − t) / s)

and an answer moves the s of what it was about:

  right, at recall chance p:   s → s (1 + B (1 − p))    what was nearly forgotten and still recalled gains the most;
                               at p = 0.9 it is × 2.5. The first recall after a wait makes a memory of minutes
                               one of days (S1 = 3, about three in four recalled the next day): a night's sleep
                               does what no repetition within the hour does
  wrong:                       s → s · LAPSE            relearned, so weaker but not from nothing: between S0 and half
                               a day, so that it has to be recalled after a wait once more to count as known

What is just learned starts at S0, ten minutes; what the first quiz found known at one to eight months, longer the
surer the level was that it would be known. There are no due dates and no steps: what is asked next, new or old, is
chosen in levels.ts from these chances, by the same weight as a new kanji; a card's turn comes by the weaker of its
two memories, and a question about it asks both.
*/
export const S0 = 10 / 1440
export const S1 = 3
export const B = 15
export const LAPSE = 0.1

export type Mem = { s: number; t: number }
/** m: the memory of the meaning; r: of the reading (a kanji's card only). */
export type Card = { id: string; m: Mem; r?: Mem; reps: number; lapses: number }
export type Aspect = 'm' | 'r'
export type LogEntry = { t: number; id: string; ok: boolean }
/** The kinds of question: a kanji or a part never seen, a card asked by itself, a card asked through a word (words.ts). */
export type Kind = 'new' | 'review' | 'words'
/** An answer at a kanji's first quiz: [kanji, meaning right, reading right]; one saved before the two were told apart
 * is [kanji, both right]. */
export type Answer = [string, 0 | 1, (0 | 1)?]
/** start: the level picked; mu, T: how many kanji were known before, meaning and reading both, and how blurred that
 * frontier is, fitted to answers (src/levels.ts); mus: how many by meaning and how many by reading;
 * lam: how much their order follows frequency rather than courses; tau: how wide the choice of the next kanji is;
 * off: the kinds of question turned off on the learn screen; v: how it is saved (2: a kanji's meaning and reading
 * remembered apart; earlier ones are read in past.ts). */
export type Store = { cards: Record<string, Card>; log: LogEntry[]; start?: { mu: number; T: number }; mu?: number; T?: number; lam?: number; mus?: Record<Aspect, number>; answers?: Answer[]; tau?: number; seed?: number; off?: Kind[]; v?: 2 }
type Fit = Partial<Pick<Store, 'mu' | 'T' | 'lam' | 'mus' | 'answers'>>

export const KEY = 'kanly/v1'

/** Nothing learned yet. */
export const empty = (): Store => ({ cards: {}, log: [], v: 2 })

export const save = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s))

/** The chance a memory still holds. */
export const recall = (m: Mem, now: number) => Math.exp(-Math.max(0, now - m.t) / (m.s * DAY))

/** The same for the weaker of a card's memories: the one its turn comes by. */
export const weakest = (c: Card, now: number) => Math.min(recall(c.m, now), c.r ? recall(c.r, now) : 1)

/** A memory after an answer. */
export function asked(m: Mem, ok: boolean, now: number): Mem {
  const q = 1 - recall(m, now)
  if (!ok) return { s: Math.max(S0, Math.min(0.5, m.s * LAPSE)), t: now }
  // a day's memory only for a recall after some wait: one asked again at once has shown nothing
  return { s: Math.max(m.s * (1 + B * q), S1 * Math.min(1, q / 0.1)), t: now }
}

/** Something seen for the first time, a kanji after its quiz. What the quiz found known has a memory of one to eight
 * months, longer the surer the level was (p) that it would be known, and spread at random, as nothing says how long ago
 * it was learned: hundreds known on one day then do not all come back on another. The rest is ten minutes old. */
export const meet = (s: Store, id: string, now: number, meaning: boolean, reading: boolean, fit: Fit = {}, p = 0.5): Store => {
  const before = (30 + 120 * p) * (0.75 + Math.random())
  const mem = (knew: boolean): Mem => ({ s: knew ? before : S0, t: now })
  return { ...s, ...fit, cards: { ...s.cards, [id]: { id, m: mem(meaning), ...(KANJI[id] && { r: mem(reading) }), reps: meaning && reading ? 1 : 0, lapses: 0 } } }
}
/** Nothing of it known. */
export const learn = (s: Store, id: string, now: number, fit: Fit = {}): Store => meet(s, id, now, false, false, fit)
/** Meaning and reading both known at the first quiz. */
export const knewIt = (s: Store, id: string, now: number, fit: Fit = {}, p = 0.5): Store => meet(s, id, now, true, true, fit, p)

/** After a question about a card: each memory moves by its own answer (a part has no reading to answer for). */
export const answer = (s: Store, id: string, meaning: boolean, reading: boolean, now: number): Store => {
  const c = s.cards[id], ok = meaning && (reading || !c.r)
  const card: Card = { ...c, m: asked(c.m, meaning, now), ...(c.r && { r: asked(c.r, reading, now) }), reps: c.reps + 1, lapses: c.lapses + (ok ? 0 : 1) }
  return { ...s, cards: { ...s.cards, [id]: card }, log: [...s.log, { t: now, id, ok }] }
}

export type Status = 'new' | 'learning' | 'known'
/** Learning while the memory is shorter than a day, known from then on: of the meaning or of the reading (of), or, for
 * the card as a whole, of the weaker of the two. A part's reading stands as its meaning does. */
export const status = (s: Store, id: string, of?: Aspect): Status => {
  const c = s.cards[id]
  if (!c) return 'new'
  const mems = of ? [c[of] ?? c.m] : [c.m, c.r ?? c.m]
  return mems.every(m => m.s >= 1) ? 'known' : 'learning'
}
