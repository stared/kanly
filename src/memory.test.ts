import { expect, it } from 'vitest'
import { KANJI } from './data'
import { DELTA, Q_ASK, Q_BEST, RHO, lnCard, lnNew, marks, next, reach, standing } from './levels'
import { B, DAY, MIN, S0, S1, answer, asked, meet, recall, status, weakest, type Mem, type Store } from './srs'

it('a memory lasts longer after each recall, the more the nearer it was to forgotten', () => {
  const c: Mem = { s: S0, t: 0 }
  expect(recall(c, 0)).toBe(1)
  expect(recall(c, 10 * MIN)).toBeCloseTo(Math.exp(-1), 6)
  expect(asked(c, true, 1000).s).toBeLessThan(0.1)          // asked again at once: nothing shown, no day's memory
  const day = asked(c, true, 3 * MIN)
  expect(day.s).toBe(S1)                                     // the first recall after a wait: a day
  const late = asked(day, true, 3 * MIN + DAY), soon = asked(day, true, 3 * MIN + DAY / 10)
  expect(late.s).toBeCloseTo(S1 * (1 + B * (1 - Math.exp(-1 / S1))), 6)  // the lower the chance it was recalled at, the more it gains
  expect(soon.s).toBeLessThan(late.s)
  expect(asked(late, false, 3 * MIN + 2 * DAY).s).toBe(0.5)  // forgotten: weaker, not gone, and to be recalled again before it counts as known
  expect(asked(c, false, MIN).s).toBe(S0)
})

/** One memory per kanji, as when its meaning and its reading are always answered alike. */
type C = Mem & { id: string; f: number }
type Pick = (cards: C[], fNew: number, now: number) => number
type After = (c: C, ok: boolean, now: number, isNew: boolean) => void

/** A learner with `budget` units of effort a day (a new kanji costs 1, a quiz ρ; a unit is taken as 30 s), whose memory
 * is the one of srs.ts. Of the kanji, most written first, the first `skip` are never asked (the level is sure of them)
 * and those up to `knows` are known at their first quiz (a memory of two to five months, as knewIt gives).
 * `pick` says what to ask: a card's index, or −1 for the next new kanji.
 * Returns the share of the kanji in text on cards that can be read at the start of the last ten days' sessions,
 * and how the questions about cards went. */
function study(days: number, budget: number, skip: number, knows: number, pick: Pick, after: After = () => {}) {
  const order = Object.entries(KANJI).sort((a, b) => b[1].freq - a[1].freq).slice(skip)
  const cards: C[] = []
  let x = 7, reviews = 0, failed = 0, easy = 0, readable = 0
  const rand = () => (x = (x * 16807) % 2147483647) / 2147483647
  for (let d = 0; d < days; d++) {
    let now = d * DAY, left = budget
    if (d >= days - 10) readable += cards.reduce((a, c) => a + c.f * recall(c, now), 0) / 10
    while (left > 0) {
      const i = pick(cards, order[cards.length]?.[1].freq ?? 0, now)
      let effort = 1
      if (i < 0) {
        if (cards.length === order.length) break
        const [id, k] = order[cards.length], knew = skip + cards.length < knows
        cards.push({ id, f: k.freq, s: knew ? 90 * (0.75 + rand()) : S0, t: now })
        if (knew) effort = RHO
        after(cards[cards.length - 1], knew, now, true)
      } else {
        const p = recall(cards[i], now), ok = rand() < p
        reviews++; if (!ok) failed++; if (p > 0.95) easy++
        effort = ok ? RHO : 1 + RHO
        cards[i] = { ...cards[i], ...asked(cards[i], ok, now) }
        after(cards[i], ok, now, false)
      }
      left -= effort
      now += effort * 30_000
    }
  }
  return { learned: cards.length, readable, reviews, failed: failed / Math.max(1, reviews), easy: easy / Math.max(1, reviews) }
}

/** The queue as in levels.ts, for a recall lost `at` which a card's turn comes and a width δ: the card or the new kanji with the largest weight. */
const queue = (at: number, delta: number): Pick => (cards, fNew, now) => {
  let best = -1, top = fNew > 0 ? lnNew(fNew, 1, 1) : -Infinity
  cards.forEach((c, i) => { const v = lnCard(c.f, 1 - recall(c, now), delta, at); if (v > top) { top = v; best = i } })
  return best
}

/** The scheduler this replaced: due after 1 minute, 10 minutes, a day, then 2.5 times the last interval (less after misses);
 * whatever is due comes before anything new. A kanji known at its first quiz is due after one to two and a half months. */
function ladder(): { pick: Pick; after: After } {
  const st = new Map<string, { due: number; step: number; ivl: number; ease: number }>()
  let n = 0
  return {
    pick: (cards, _f, now) => {
      let best = -1, first = Infinity
      cards.forEach((c, i) => { const due = st.get(c.id)!.due; if (due <= now && due < first) { first = due; best = i } })
      return best
    },
    after: (c, ok, now, isNew) => {
      const o = st.get(c.id) ?? { due: 0, step: 0, ivl: 0, ease: 2.5 }
      if (isNew && ok) { const ivl = 33 + (n++ * 37) % 45; return void st.set(c.id, { ...o, step: 2, ivl, due: now + ivl * DAY }) }
      if (isNew) return void st.set(c.id, { ...o, due: now + MIN })
      if (!ok) return void st.set(c.id, { due: now + MIN, step: 0, ivl: 0, ease: Math.max(1.3, o.ease - 0.2) })
      if (o.ivl === 0) return void st.set(c.id, o.step === 0 ? { ...o, step: 1, due: now + 10 * MIN } : { ...o, step: 2, ivl: 1, due: now + DAY - 4 * 3600_000 })
      const ivl = Math.max(o.ivl + 1, Math.round(o.ivl * o.ease))
      st.set(c.id, { ...o, ivl, due: now + ivl * DAY - 4 * 3600_000 })
    },
  }
}

it('one queue reads more text for the same effort than the ladder of fixed intervals, for a beginner and an advanced learner', () => {
  const days = 120, budget = 40
  const row = (name: string, r: ReturnType<typeof study>) =>
    console.log(`  ${name.padEnd(20)} cards ${String(r.learned).padStart(4)}  text readable ${(r.readable * 100).toFixed(1).padStart(5)}%  questions about cards ${String(r.reviews).padStart(5)}  failed ${(r.failed * 100).toFixed(0).padStart(3)}%  at over 95% recall ${(r.easy * 100).toFixed(0).padStart(3)}%`)
  const got: ReturnType<typeof study>[][] = []
  for (const [name, skip, knows] of [['a beginner', 0, 0], ['knows the 800 most written kanji; the level is sure of 400 of them', 400, 800]] as const) {
    console.log(name)
    const l = ladder()
    const old = study(days, budget, skip, knows, l.pick, l.after)
    row('ladder', old)
    // GRID=1 pnpm vitest run src/memory.test.ts --silent=false: the other asking points and widths tried
    if ((globalThis as { process?: { env: Record<string, string> } }).process?.env.GRID)
      for (const at of [0.05, 0.07, 0.1, 0.15]) for (const d of [0.005, 0.01, 0.02]) row(`queue q=${at} δ=${d}`, study(days, budget, skip, knows, queue(at, d)))
    const now = study(days, budget, skip, knows, queue(Q_ASK, DELTA))
    row(`queue q=${Q_ASK} δ=${DELTA} *`, now)
    got.push([old, now])
  }
  for (const [old, now] of got) {
    expect(now.readable).toBeGreaterThan(old.readable)
    expect(now.failed).toBeLessThan(old.failed)
    expect(now.easy).toBeLessThan(0.3)
  }
})

it('a card comes up as its recall falls to the asking point, and long before that against nothing', () => {
  expect(Q_BEST).toBeGreaterThan(0.15)
  expect(Q_BEST).toBeLessThan(0.25)
  expect(lnCard(0.01, Q_ASK)).toBeCloseTo(lnNew(0.01, 1, 1), 6)       // at its moment: as much as a new kanji written as often
  expect(lnCard(0.01, 0.005)).toBeLessThan(lnNew(0.01 / 50, 1, 1))    // long before it: not even against one 50 times rarer
})

it('remembers a kanji\'s meaning and its reading apart, each moved by its own answer', () => {
  const blank: Store = { cards: {}, log: [] }
  // the first quiz: the meaning known, the reading not
  let s = meet(blank, '時', 0, true, false)
  expect([status(s, '時', 'm'), status(s, '時', 'r'), status(s, '時')]).toEqual(['known', 'learning', 'learning'])
  expect(marks(s, '時')).toBe('known r-learning')
  expect(standing(s, '時')).toBe('learning')                      // as a whole: as its weaker half
  // its turn comes by the reading, minutes old, though the meaning will hold for months
  const c = s.cards['時']
  expect(recall(c.m, 10 * MIN)).toBeGreaterThan(0.999)
  expect(weakest(c, 10 * MIN)).toBeCloseTo(Math.exp(-1), 6)
  expect(next({ ...s, mu: 2136 }, 10 * MIN, 0, { fresh: false })).toEqual({ el: '時', seen: true })
  // asked then: the reading right gains a day's memory and more, the meaning, asked far too early to show anything, stays as it was
  s = answer(s, '時', true, true, 10 * MIN)
  expect(s.cards['時'].r!.s).toBe(S1)
  expect(s.cards['時'].m.s / c.m.s).toBeCloseTo(1, 2)
  expect(marks(s, '時')).toBe('known')
  // the meaning missed: that memory alone falls back
  const missed = answer(s, '時', false, true, 10 * MIN + DAY)
  expect([status(missed, '時', 'm'), status(missed, '時', 'r')]).toEqual(['learning', 'known'])
  expect(missed.cards['時'].lapses).toBe(1)
  expect(marks(missed, '時')).toBe('learning r-known')
  // what can be read of text, by meaning and by reading: the same for what was never asked, apart for a card
  const before = reach(blank, 0), after = reach(meet(blank, '時', 0, true, false), DAY)
  expect(before.meaning).toBe(before.reading)
  expect(after.meaning - after.reading).toBeGreaterThan(0.9 * KANJI['時'].freq)
  // a part has a meaning only
  const part = answer(meet(blank, '亻', 0, false, false), '亻', true, true, 10 * MIN)
  expect(part.cards['亻'].r).toBeUndefined()
  expect(marks(part, '亻')).toBe('known')
})
