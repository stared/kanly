import { KANJI } from './data'
import { DAY, KEY, S0, asked, empty, type Answer, type Card, type Mem, type Store } from './srs'
import { posterior, start } from './levels'
import { events, type Ev } from './track'

/*
Progress as earlier versions saved it, read as this one keeps it.

Until a kanji's meaning and its reading were remembered apart, a card had one memory, moved by one answer, right only
if both were. The answers themselves were logged with the two apart all along, each with the card as it was when asked
(track.ts). So the two memories are followed through those answers, in order: where the reading was missed and the
meaning known, the meaning's memory grows as it would have, and the reading's is the card's. A memory answered as the
card was is the card's own, to the digit. An answer the card never counted (the page left before "next") is passed
over; a card that counts answers the log does not have (older than the log, or brought from another browser without it)
keeps its one memory as both. The level is fitted anew to the same answers, one edge for meanings and one for readings
(levels.ts).
*/

/** A card with one memory for the kanji as a whole; or, older still, of the scheduler with due dates (steps of 1 and 10
 * minutes, then intervals in days), which asked at the due date, taken as the moment recall falls to 90%, at the end of
 * the card's last interval. */
type Whole = { id: string; s: number; t: number; reps: number; lapses: number }
type Due = { id: string; due: number; step: number; ivl: number; reps: number; lapses: number }
type Saved = Card | Whole | Due

/** The one memory as that of the meaning and of the reading alike. */
const both = (c: Saved): Card => {
  if ('m' in c) return c
  const ivl = 's' in c ? 0 : c.ivl >= 1 ? c.ivl : (c.step >= 1 ? 10 : 1) / 1440
  const mem: Mem = 's' in c ? { s: c.s, t: c.t } : { s: Math.max(S0, ivl / -Math.log(0.9)), t: c.due - ivl * DAY }
  return { id: c.id, m: mem, ...(KANJI[c.id] && { r: mem }), reps: c.reps, lapses: c.lapses }
}

/** A quiz as logged: at a kanji's first meeting (first) or of its card, with the card as it was when asked. */
type Asked = { first: boolean; meaning: boolean; reading: boolean; card?: Saved; p?: number }

/** The quizzes of each kanji, oldest first, from its last first meeting on; a meaning the learner overruled is right. */
function quizzes(evs: Ev[]): Map<string, Asked[]> {
  const by = new Map<string, Asked[]>()
  for (const e of evs) {
    if (typeof e.el !== 'string') continue
    if (e.e === 'overrule') { const last = by.get(e.el)?.at(-1); if (last) last.meaning = true }
    if (e.e !== 'quiz') continue
    const q: Asked = { first: e.in === 'learn', meaning: !!e.meaning, reading: !!e.reading, card: e.card as Saved | undefined, p: e.p as number | undefined }
    by.set(e.el, q.first ? [q] : [...(by.get(e.el) ?? []), q])
  }
  return by
}

const same = (a: Mem, b: Mem) => a.s === b.s && a.t === b.t

/** A kanji's card as saved, with its two memories as its logged answers make them. */
function again(saved: Saved, qs: Asked[] = []): Card {
  const c = both(saved)
  if (!c.r || !qs.length) return c
  let m: Mem | undefined, r: Mem | undefined
  for (const [i, q] of qs.entries()) {
    // the card as the next question found it, or as it is now: what this answer made of it, and when
    const then = both(qs[i + 1]?.card ?? saved), t = then.m.t
    const ok = q.meaning && q.reading
    if (q.first) {
      if (then.reps !== +ok) return c  // asked since, and not logged
      // what a first quiz finds known gets a memory of months, the rest ten minutes (meet, srs.ts). With one memory it
      // was months only if both were known: the meaning known alone gets the mean of what would have been drawn for it
      const months = { s: (30 + 120 * (q.p ?? 0.5)) * 1.25, t }, one = same(then.m, then.r ?? then.m)
      m = one && q.meaning && !q.reading ? months : then.m
      r = one && q.reading && !q.meaning ? months : then.r ?? then.m
      continue
    }
    if (!q.card) return c
    const was = both(q.card)
    if (!m || !r) { m = was.m; r = was.r ?? was.m }
    if (then.reps === was.reps) continue  // answered, and the page left before "next": the card never counted it
    if (then.reps !== was.reps + 1) return c
    // the card was moved by one answer for both, or since by each its own: a memory that was the card's and was answered
    // as the card was is the card's still
    const [km, kr] = 'm' in q.card ? [q.meaning, q.reading] : [ok, ok]
    m = same(m, was.m) && q.meaning === km ? then.m : asked(m, q.meaning, t)
    r = same(r, was.r ?? was.m) && q.reading === kr ? then.r ?? then.m : asked(r, q.reading, t)
  }
  return m && r ? { ...c, m, r } : c
}

/** A store as saved or exported by any version, with the answers logged along with it. */
export function read(s: Store, evs: Ev[] = []): Store {
  if (s.v === 2) return s
  const qs = quizzes(evs)
  const cards = Object.fromEntries(Object.entries(s.cards as Record<string, Saved>).map(([id, c]) => [id, again(c, qs.get(id))]))
  // the answers the level is fitted to: those logged, with the meaning and the reading apart
  const answers = s.answers?.map((a): Answer => {
    const q = qs.get(a[0])?.[0]
    return a.length === 2 && q?.first && +(q.meaning && q.reading) === a[1] ? [a[0], q.meaning ? 1 : 0, q.reading ? 1 : 0] : a
  })
  return { ...s, cards, ...(answers?.length && { answers, ...posterior(start(s), answers) }), v: 2 }
}

/** What is saved in this browser. What an earlier version saved is kept as it was, under its own key, if there is room. */
export function load(): Store {
  try {
    const raw = localStorage.getItem(KEY) ?? ''
    const s = JSON.parse(raw)
    if (s?.cards) {
      if (s.v !== 2 && Object.keys(s.cards).length) try { localStorage.setItem(KEY + '/before-2', raw) } catch {}
      return read(s, events())
    }
  } catch {}
  return empty()
}
