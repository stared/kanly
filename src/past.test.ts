import { expect, it } from 'vitest'
import { KANJI } from './data'
import { reach } from './levels'
import { read } from './past'
import { DAY, MIN, S0, asked, recall, type Store } from './srs'
import type { Ev } from './track'

const quiz = (t: number, where: 'learn' | 'review', el: string, meaning: boolean | null, reading: boolean | null, more: object = {}): Ev => ({ t, e: 'quiz', in: where, el, meaning, reading, ...more })
const whole = (id: string, s: number, t: number, reps: number, lapses = 0) => ({ id, s, t, reps, lapses })

it('reads a card saved with one memory as that of its meaning and of its reading', () => {
  const old = { cards: { 時: whole('時', 4, 5, 2, 1), 亻: whole('亻', 0.01, 5, 0) }, log: [] } as unknown as Store
  const s = read(old)
  expect(s.cards['時']).toEqual({ id: '時', m: { s: 4, t: 5 }, r: { s: 4, t: 5 }, reps: 2, lapses: 1 })
  expect(s.cards['亻']).toEqual({ id: '亻', m: { s: 0.01, t: 5 }, reps: 0, lapses: 0 })
  expect(read(s)).toBe(s)
})

/** The app as it was: one memory a card, moved by one answer, right only if both were; the quiz logged with the two
 * apart and with the card as it was, the answer counted half a minute later, at "next" (or never: counted false). */
function before() {
  const cards: Record<string, ReturnType<typeof whole>> = {}, evs: Ev[] = []
  return {
    cards, evs,
    meet(t: number, el: string, meaning: boolean | null, reading: boolean | null) {
      evs.push(quiz(t, 'learn', el, meaning, reading, { p: 0.5 }))
      cards[el] = whole(el, meaning && reading ? 100 : S0, t + MIN / 2, meaning && reading ? 1 : 0)
    },
    ask(t: number, el: string, meaning: boolean | null, reading: boolean | null, counted = true, overruled = false) {
      const c = cards[el], ok = (!!meaning || overruled) && !!reading
      evs.push(quiz(t, 'review', el, meaning, reading, { card: { ...c } }))
      if (overruled) evs.push({ t: t + 1, e: 'overrule', el, word: el, typed: 'so' })
      if (counted) cards[el] = { ...c, ...asked(c, ok, t + MIN / 2), reps: c.reps + 1, lapses: c.lapses + (ok ? 0 : 1) }
    },
  }
}

it('tells the two memories apart by the answers logged, followed in order', () => {
  const T0 = 1000 * DAY, app = before()
  // 時: the meaning known at the first quiz and since, the reading never: saved as one memory, it is minutes old
  app.meet(T0, '時', true, null)
  app.ask(T0 + 10 * MIN, '時', true, false)
  app.ask(T0 + DAY, '時', true, null)
  // 人: both known all along: the one memory was right
  app.meet(T0, '人', true, true)
  app.ask(T0 + DAY, '人', true, true)
  // 山: a wrong answer the card never counted (the page left before "next"), then a right one
  app.meet(T0, '山', true, true)
  app.ask(T0 + DAY, '山', false, false, false)
  app.ask(T0 + 2 * DAY, '山', true, true)
  // 川: asked once more than logged
  app.meet(T0, '川', true, false)
  app.ask(T0 + DAY, '川', true, true)
  app.cards['川'] = { ...app.cards['川'], reps: app.cards['川'].reps + 1, s: 9 }
  // 木: met before the log began; a meaning marked wrong and overruled, the reading missed; then both missed
  app.cards['木'] = whole('木', 4, T0, 2)
  app.ask(T0 + DAY, '木', false, false, true, true)
  app.ask(T0 + 2 * DAY, '木', false, false)
  // 亻: a part, never quizzed
  app.cards['亻'] = whole('亻', 5, T0, 1)
  const old = { cards: app.cards, log: [], answers: [['時', 0], ['人', 1], ['山', 1], ['川', 0]] } as unknown as Store
  const one = (el: string) => ({ s: app.cards[el].s, t: app.cards[el].t })

  const s = read(old, app.evs)
  const { 時: toki, 人: hito, 山: yama, 川: kawa, 木: ki, 亻: part } = s.cards
  expect(toki.r).toEqual(one('時'))                            // the reading: what the card had
  expect(toki.r!.s).toBeLessThan(1)
  expect(toki.m.t).toBe(toki.r!.t)
  expect(toki.m.s).toBeGreaterThan(60)                       // the meaning: months, as what a first quiz finds known
  expect([toki.reps, toki.lapses]).toEqual([2, 2])            // how often it was asked and missed: as counted
  expect([hito.m, hito.r]).toEqual([one('人'), one('人')])
  expect([yama.m, yama.r]).toEqual([one('山'), one('山')])
  expect([kawa.m, kawa.r]).toEqual([one('川'), one('川')])
  expect(ki.m.s).toBeLessThan(1)                             // right once ("I was right"), then missed
  expect(ki.m.s).toBeGreaterThan(ki.r!.s)                    // missed once, where the reading was missed twice
  expect(ki.r).toEqual(one('木'))
  expect(part).toEqual({ id: '亻', m: { s: 5, t: T0 }, reps: 1, lapses: 0 })
  // what can be read: the meaning of 時 now counts, its reading does not
  const can = reach(s, T0 + 2 * DAY)
  expect(can.meaning - can.reading).toBeGreaterThan(0.9 * KANJI['時'].freq)
  // the level: fitted to the same answers with the two apart, the meanings ahead
  expect(s.answers).toEqual([['時', 1, 0], ['人', 1, 1], ['山', 1, 1], ['川', 1, 0]])
  expect(s.mus!.m).toBeGreaterThan(s.mus!.r)
  expect(s.mus!.r).toBe(s.mu)
  // read once: saved as it now is, it is not read anew
  expect(s.v).toBe(2)
  expect(read(JSON.parse(JSON.stringify(s)), app.evs)).toEqual(s)
  // saved with two memories a card, both the one it had, and not yet marked as read: the same
  const between = { ...old, cards: Object.fromEntries(Object.values(app.cards).map(c => [c.id, { id: c.id, m: { s: c.s, t: c.t }, ...(KANJI[c.id] && { r: { s: c.s, t: c.t } }), reps: c.reps, lapses: c.lapses }])) } as unknown as Store
  expect(read(between, app.evs)).toEqual(s)
})

// EXPORT=path/to/kanly-progress.json pnpm test past: what a real export becomes
const EXPORT = (globalThis as { process?: { env: Record<string, string> } }).process?.env.EXPORT
it.runIf(EXPORT)('reads an export', async () => {
  const fs = 'node:fs'
  const { events: evs = [], notes: _, ...old } = JSON.parse((await import(/* @vite-ignore */ fs)).readFileSync(EXPORT, 'utf8'))
  const now = Math.max(...evs.map((e: Ev) => e.t), ...Object.values(old.cards as Record<string, { t?: number; m?: { t: number } }>).map(c => c.t ?? c.m?.t ?? 0))
  const as = read(old), s = read(old, evs)
  const pct = (c: { meaning: number; reading: number }) => `meaning ${(c.meaning * 100).toFixed(1)}% reading ${(c.reading * 100).toFixed(1)}%`
  console.log('one memory as both: ', pct(reach(as, now)), '| level', Math.round(as.mu!), 'T', Math.round(as.T!), 'λ', as.lam, as.mus)
  console.log('by the answers logged:', pct(reach(s, now)), '| level', Math.round(s.mu!), 'T', Math.round(s.T!), 'λ', s.lam, s.mus)
  const day = (x: number) => x < 1 ? `${Math.round(x * 1440)}min` : `${x.toFixed(1)}d`
  for (const c of Object.values(s.cards)) {
    const was = as.cards[c.id]
    if (c.r && (c.m.s !== was.m.s || c.r.s !== was.r!.s))
      console.log(c.id, 'was', day(was.m.s), '→ meaning', day(c.m.s), `(${Math.round(recall(c.m, now) * 100)}%)`, 'reading', day(c.r.s), `(${Math.round(recall(c.r, now) * 100)}%)`)
  }
  console.log('answers with the two apart:', s.answers?.filter(a => a.length === 3).length, 'of', s.answers?.length)
})
