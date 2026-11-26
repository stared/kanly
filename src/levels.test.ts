import { describe, expect, it } from 'vitest'
import { KANJI } from './data'
import { GUESS, LAMBDAS, LEAD, MUS, Phi, SLIP, SURE, TS, levelOf, pKnown, pOf, posterior, reach, standing, startAt, update, upcoming } from './levels'
import { knewIt, learn, meet, type Answer, type Store } from './srs'

const empty: Store = { cards: {}, log: [] }

describe('levels', () => {
  it('a beginner starts with the most used kanji, each after its parts (木 before 本)', () => {
    const first = upcoming(empty, 0, 12)
    console.log('beginner', first.join(''))
    expect(first.slice(0, 4)).toEqual(expect.arrayContaining(['人', '日', '一']))
    expect(first.indexOf('木')).toBeLessThan(first.indexOf('本'))
  })
  it('someone who knows 1000 kanji gets ones around the 1000th, pulled by usefulness (誰 俺 are taught late but used a lot)', () => {
    const s = { ...empty, mu: 1000 }
    const next = upcoming(s, 0, 20).filter(el => KANJI[el])
    console.log('μ=1000', next.join(''), next.map(el => KANJI[el].level).join(' '))
    const lv = next.map(el => KANJI[el].level).sort((a, b) => a - b)
    expect(lv[lv.length >> 1]).toBeGreaterThan(900)
    expect(lv[lv.length >> 1]).toBeLessThan(1300)
  })
  it('breadth brings other kanji, and never ones surely known', () => {
    const s = { ...empty, mu: 1000, T: 260 }
    const focused = new Set(upcoming(s, 0, 30)), wide = upcoming(s, 1, 30)
    console.log('τ=1', wide.map(el => KANJI[el]?.level).join(' '))
    expect(wide.filter(el => focused.has(el)).length).toBeLessThan(15)
    expect(wide.every(el => pKnown(el, 1000, 260) <= 0.9)).toBe(true)
  })
  it('answers move the level towards the truth', () => {
    // a learner who knows exactly the 1200 easiest, starting from the N4 guess
    let s: Store = { ...empty, mu: 250 }
    for (let i = 0; i < 80; i++) {
      const el = upcoming(s, 0, 1)[0]
      const k = KANJI[el]
      s = k && k.level < 1200 ? knewIt(s, el, 0, update(s, el, true)) : learn(s, el, 0, k ? update(s, el, false) : {})
    }
    console.log('μ after 80 answers', Math.round(s.mu!), 'T', Math.round(s.T!))
    expect(Math.abs(s.mu! - 1200)).toBeLessThan(200)
    expect(pKnown('一', s.mu!)).toBeGreaterThan(0.99)
  })
})

it('takes what a learner of some level never got a card for as assumed, not new', () => {
  const blank: Store = { cards: {}, log: [] }
  expect(Object.keys(KANJI).filter(c => standing(blank, c) !== 'new')).toEqual([])  // a beginner assumes nothing
  const adv = startAt(blank, { mu: 1200, T: 200 })
  expect(standing(adv, '日')).toBe('assumed')
  expect(standing(adv, '亻')).toBe('assumed')  // a part, as known as the easiest kanji it is in
  expect(standing(adv, '鬱')).toBe('new')
  // μ is the number known: the easier half of the blurred edge is assumed, the harder half new
  expect(Object.keys(KANJI).filter(c => standing(adv, c) === 'assumed').length).toBeCloseTo(1200, -1)
  // likely but not surely known (0.5 < p < SURE): assumed, and still to be asked
  const likely = Object.keys(KANJI).filter(c => pOf(adv, c) > 0.6 && pOf(adv, c) < SURE)
  expect(likely.length).toBeGreaterThan(50)
  expect(likely.every(c => standing(adv, c) === 'assumed')).toBe(true)
  expect(Object.keys(KANJI).filter(c => pOf(adv, c) < 0.4).every(c => standing(adv, c) === 'new')).toBe(true)
  // a card says more than the level does
  expect(standing(learn(adv, '日', 0), '日')).toBe('learning')
  expect(standing(knewIt(adv, '日', 0), '日')).toBe('known')
})

/** The posterior the slow way: every pair of edges, of meaning and of reading, weighed one by one. */
function pairs(start: { mu: number; T: number }, answers: Answer[]) {
  const n = MUS.length, k = (MUS[1] - MUS[0]) / LEAD
  // the prior: of the lower edge, shared among the pairs that have it by how far the other is ahead
  const share = MUS.map((_, lo) => MUS.reduce((a, _, hi) => a + (hi > lo ? 2 : hi === lo ? 1 : 0) * Math.exp(-k * (hi - lo)), 0))
  const cells = LAMBDAS.flatMap(l => TS.map(t => {
    const ln = (x: number, e: number, right: 0 | 1, guess: number, slip: number) => { const p = Phi((x - e) / t) * (1 - slip - guess) + guess; return Math.log(right ? p : 1 - p) }
    const of = (pick: (a: Answer) => 0 | 1 | undefined, guess: number, slip: number) => MUS.map(x => answers.reduce((a, q) => a + (pick(q) === undefined ? 0 : ln(x, levelOf(q[0], l), pick(q)!, guess, slip)), 0))
    const m = of(a => a.length === 3 ? a[1] : undefined, 1 / 4, SLIP / 2), r = of(a => a[2], 1 / 4, SLIP / 2), one = of(a => a.length === 2 ? a[1] : undefined, GUESS, SLIP)
    const w: number[][] = MUS.map((_, i) => MUS.map((_, j) => { const lo = Math.min(i, j); return -(((MUS[lo] - start.mu) / 400) ** 2) / 2 - Math.log(share[lo]) - k * Math.abs(i - j) + one[lo] + m[i] + r[j] }))
    return { l, t, w, prior: -((Math.log(t / start.T) / Math.log(2)) ** 2) / 2 }
  }))
  const top = cells.reduce((a, c) => c.w.reduce((a, row) => row.reduce((a, x) => Math.max(a, x + c.prior), a), a), -Infinity)
  const by = LAMBDAS.map(l => {
    let z = 0, lo = 0, lead = 0, lt = 0
    for (const c of cells.filter(c => c.l === l)) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const q = Math.exp(c.w[i][j] + c.prior - top)
      z += q; lo += q * MUS[Math.min(i, j)]; lead += q * (MUS[i] - MUS[j]); lt += q * Math.log(c.t)
    }
    return { l, z, mu: lo / z, lead: lead / z, T: Math.exp(lt / z) }
  })
  const best = by.reduce((a, b) => b.z > a.z ? b : a)
  return { mu: best.mu, T: best.T, lam: best.l, mus: { m: best.mu + Math.max(0, best.lead), r: best.mu + Math.max(0, -best.lead) } }
}

/** The posterior as it was with one edge. */
function oneEdge(start: { mu: number; T: number }, answers: [string, 0 | 1][]) {
  const fits = LAMBDAS.map(l => {
    let w = -Infinity, cells: { m: number; t: number; lp: number }[] = []
    for (const m of MUS) for (const t of TS) {
      let lp = -(((m - start.mu) / 400) ** 2) / 2 - (Math.log(t / start.T) / Math.log(2)) ** 2 / 2
      for (const [ch, y] of answers) { const right = Phi((m - levelOf(ch, l)) / t) * (1 - SLIP - GUESS) + GUESS; lp += Math.log(y ? right : 1 - right) }
      cells.push({ m, t, lp }); w = Math.max(w, lp)
    }
    return { l, w, cells }
  })
  const top = Math.max(...fits.map(f => f.w))
  const by = fits.map(f => { let z = 0, m = 0, lt = 0; for (const c of f.cells) { const q = Math.exp(c.lp - top); z += q; m += q * c.m; lt += q * Math.log(c.t) } return { l: f.l, z, mu: m / z, T: Math.exp(lt / z) } })
  return by.reduce((a, b) => b.z > a.z ? b : a)
}

describe('two edges, of meaning and of reading', () => {
  const some = Object.keys(KANJI).sort((a, b) => levelOf(a) - levelOf(b))
  const at = (i: number) => some[i]
  it('answers saved as one say what they said: the same level, and neither edge ahead', () => {
    const answers: [string, 0 | 1][] = [[at(50), 1], [at(200), 1], [at(420), 1], [at(600), 0], [at(650), 1], [at(900), 0], [at(1400), 0]]
    for (const start of [{ mu: 609, T: 200 }, { mu: -450, T: 260 }, { mu: 2000, T: 100 }]) {
      const now = posterior(start, answers), then = oneEdge(start, answers)
      expect(now.mu).toBeCloseTo(then.mu, 6)
      expect(now.T).toBeCloseTo(then.T, 6)
      expect(now.lam).toBe(then.l)
      expect(now.mus).toEqual({ m: now.mu, r: now.mu })
    }
  })
  it('sums over all pairs of edges without visiting them', () => {
    const answers: Answer[] = [[at(50), 1, 1], [at(200), 1], [at(300), 1, 0], [at(420), 1, 0], [at(600), 0], [at(650), 1, 0], [at(900), 0, 1], [at(1400), 0, 0]]
    for (const a of [answers, answers.slice(0, 3), [], answers.map(([ch, m, r]): Answer => r === undefined ? [ch, m] : [ch, r, m])]) {
      const fast = posterior({ mu: 400, T: 200 }, a), slow = pairs({ mu: 400, T: 200 }, a)
      expect(fast.mu).toBeCloseTo(slow.mu, 6)
      expect(fast.T).toBeCloseTo(slow.T, 6)
      expect(fast.mus.m).toBeCloseTo(slow.mus.m, 6)
      expect(fast.mus.r).toBeCloseTo(slow.mus.r, 6)
      if (a.length) expect(fast.lam).toBe(slow.lam)
    }
    // the meaning and the reading are told apart by nothing but the answers
    const fit = posterior({ mu: 400, T: 200 }, answers), mirror = posterior({ mu: 400, T: 200 }, answers.map(([ch, m, r]): Answer => r === undefined ? [ch, m] : [ch, r, m]))
    expect(mirror.mus.m).toBeCloseTo(fit.mus.r, 6)
    expect(mirror.mus.r).toBeCloseTo(fit.mus.m, 6)
    expect(fit.mus.m).toBeGreaterThan(fit.mus.r)
    expect(fit.mus.r).toBe(fit.mu)
  })
  it('finds the meanings of someone who knows 1200 of them and reads 400', () => {
    let s: Store = startAt({ cards: {}, log: [] }, { mu: 400, T: 200 })
    expect(reach(s, 0).meaning).toBe(reach(s, 0).reading)  // nothing says yet that one is ahead
    let x = 7
    const rand = () => (x = (x * 16807) % 2147483647) / 2147483647
    const trace: string[] = []
    for (let i = 1; i <= 60; i++) {
      const el = upcoming(s, 0, 1)[0], k = KANJI[el]
      const meaning = !!k && (levelOf(el) < 1200 || rand() < 1 / 4), reading = !!k && (levelOf(el) < 400 || rand() < 1 / 4)
      s = meet(s, el, 0, meaning, reading, k ? update(s, el, meaning, reading) : {})
      if ([10, 20, 40, 60].includes(i)) trace.push(`${i}: meaning ${Math.round(s.mus!.m)} reading ${Math.round(s.mus!.r)}`)
    }
    console.log('knows 1200 meanings, 400 readings, from 400:', trace.join('  '))
    expect(s.mus!.r).toBe(s.mu)
    expect(Math.abs(s.mu! - 400)).toBeLessThan(250)
    expect(s.mus!.m - s.mus!.r).toBeGreaterThan(300)
    // by meaning more is assumed known, and more of text read
    const assumed = (of: 'm' | 'r') => Object.keys(KANJI).filter(c => standing(s, c, of) === 'assumed').length
    expect(assumed('m')).toBeGreaterThan(assumed('r') + 200)
    expect(reach(s, 0).meaning).toBeGreaterThan(reach(s, 0).reading + 0.05)
  })
})
