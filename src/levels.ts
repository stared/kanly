import { COMP, D, KANJI, ORDER, POS, type Tree } from './data'
import type { Store } from './srs'

/*
What to learn next, at any level.

Every kanji has a difficulty `level`: its rank, 0 for the one learners know first (fitted in build_data.py).
A learner who knows about μ kanji knows kanji k with probability

  p(k) = Φ((μ − level(k)) / T)

a step at μ blurred by a Gaussian of width T: a Fermi sea with disorder rather than heat. Ranks make the
density of states flat, so μ is the number of kanji known. On the official lists a Gaussian edge fits slightly
better than the Fermi–Dirac one, 1 / (1 + e^((level − μ)/T)), and its tail is lighter: a list missing a kanji
500 ranks below its edge happens about once in 500, which the Fermi tail overestimates 10 times, and that tail
is what made someone who knows 1000 kanji get asked about 人. Official lists are blurred by T = 110–530.

Each kanji not yet seen gets the weight: expected usefulness per expected effort,

  w = (1 − p) f / ((1 − p) cost^α + p ρ)       (in logs, plus τ g)

f is how much of common vocabulary uses it (from wordfreq: unlike character counts, it does not rank name kanji
like 藤 and 阪 high). cost is what its shape takes to learn given what is known: a known part is one chunk, an
unknown one its strokes. ρ is the effort of a tap on "I know it", relative to learning a one-chunk kanji. A known
card is cheap, so a frequent kanji is worth showing even if it is probably known: in simulation, with ρ = 0.3,
this finds 13–34% more useful kanji per unit of effort than counting cards, at about 2 cards shown per new one.
(ρ = 0.1 gains more, but asks someone who knows 1000 kanji whether they know 人.) g is Gumbel noise fixed per kanji: τ > 0 samples ∝ w^(1/τ), so easier and harder
ones show up too. τ = 0 takes the best one; for a beginner (p ≈ 0) that is simple-first order. Variety has a price:
in simulation τ = 0.25, 0.5, 1 learn 3%, 10%, 25% less usefulness per effort, even when the difficulty ranks are
off by ±400 for the learner (the posterior already makes uncertain, useful kanji worth checking).

μ and T are the posterior mean given the answers so far ("I know it" = 1, "new to me" = 0), computed exactly
on a grid, with a prior centred on the starting level picked (a list's μ, give or take 400; its T within a
factor of 2). Fitting T pays off: in simulation, for a learner with a blurred frontier (T = 350) a fixed
T = 150 finds 30% less useful kanji in 300 cards, while a fitted T stays within 3% of the true one.
*/
export const T = 260
export const ALPHA = 1
export const RHO = 0.3
export const BEGINNER = -450

/** Starting points: each official list as a Fermi sea, its edge and blur fitted in build_data.py
 * (JLPT N3: μ = 609, T = 367; kentei lists are sharper, since kentei level is part of the difficulty). */
export const LEVELS: { label: string; mu: number; T: number }[] = [
  { label: 'beginner', mu: BEGINNER, T },
  ...D.levels.official.map(o => ({ label: `${o.name}, ${o.n} kanji`, mu: o.mu, T: o.T })),
]
export const BREADTH: { label: string; tau: number }[] = [
  { label: 'most useful first', tau: 0 },
  { label: 'a little more varied, 3% slower', tau: 0.25 },
  { label: 'varied, 10% slower', tau: 0.5 },
  { label: 'very varied, 25% slower', tau: 1 },
]

/** Difficulty of anything learnable: a part is as hard as the easiest kanji using it. */
const LEVEL = new Map<string, number>(ORDER.map(el => [el, KANJI[el]?.level ?? Math.min(...(COMP[el]?.usedIn ?? []).map(c => KANJI[c]?.level ?? Infinity))]))
/** ln Φ(z), the log of the standard normal CDF, accurate in the far left tail (erfc as in Numerical Recipes). */
export function logPhi(z: number): number {
  const x = -z / Math.SQRT2, t = 1 / (1 + 0.5 * Math.abs(x))
  const ln = Math.log(t) - x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))  // ln erfc(|x|)
  return x >= 0 ? ln - Math.LN2 : Math.log1p(-Math.exp(ln) / 2)
}
export const Phi = (z: number) => Math.exp(logPhi(z))
export const pKnown = (el: string, mu: number, t = T) => Phi((mu - (LEVEL.get(el) ?? Infinity)) / t)

/** Fixed noise per kanji, the same every visit, so the upcoming list does not jump around. */
const gumbel = (el: string, seed: number) => {
  let h = 2166136261 ^ seed
  for (const c of el) h = Math.imul(h ^ c.codePointAt(0)!, 16777619)
  const u = ((h >>> 0) + 0.5) / 2 ** 32
  return -Math.log(-Math.log(u))
}

const chunks = (t: Tree, known: (el: string) => boolean): number =>
  known(t.el) ? 1 : !t.kids.length ? t.strokes : t.strokes - t.kids.reduce((a, k) => a + k.strokes, 0) + t.kids.reduce((a, k) => a + chunks(k, known), 0)

/** What a kanji's shape takes to learn: its own extra strokes plus a chunk or the strokes of each part. */
export const cost = (t: Tree, known: (el: string) => boolean) =>
  !t.kids.length ? t.strokes : t.strokes - t.kids.reduce((a, k) => a + k.strokes, 0) + t.kids.reduce((a, k) => a + chunks(k, known), 0)

const walk = (t: Tree, out: Set<string>) => { out.add(t.el); t.kids.forEach(k => walk(k, out)) }

export const mu = (s: Store) => s.mu ?? BEGINNER
export const temp = (s: Store) => s.T ?? T

/** The next few items to learn: a kanji, preceded by the parts it needs that are likely new. */
export function upcoming(s: Store, tau: number, n = 9): string[] {
  const m = mu(s), t = temp(s)
  const seen = new Set(Object.keys(s.cards))
  const shapes = new Set<string>()
  seen.forEach(id => KANJI[id] ? walk(KANJI[id].tree, shapes) : shapes.add(id))
  const known = (el: string) => shapes.has(el) || pKnown(el, m, t) >= 0.5
  const out: string[] = []
  while (out.length < n) {
    let best = '', top = -Infinity
    for (const [ch, k] of Object.entries(KANJI)) {
      if (seen.has(ch)) continue
      const p = pKnown(ch, m, t)
      const w = Math.log((1 - p) * (k.use + 1e-3) + 1e-30) - Math.log((1 - p) * cost(k.tree, known) ** ALPHA + p * RHO) + tau * gumbel(ch, s.seed ?? 0)
      if (w > top) { top = w; best = ch }
    }
    if (!best) break
    const parts = new Set<string>()
    walk(KANJI[best].tree, parts)
    // a part gets its own card only if it recurs: 卜 (上 外 占 …) does, 电 (only in 俺) does not
    const need = [...parts].filter(el => el !== best && POS.has(el) && !seen.has(el) && !known(el) && (KANJI[el] || (COMP[el]?.usedIn.length ?? 0) >= 2))
      .sort((a, b) => POS.get(a)! - POS.get(b)!)
    for (const el of [...need, best]) { out.push(el); seen.add(el) }
    walk(KANJI[best].tree, shapes)
  }
  return out.slice(0, n)
}

const MUS = Array.from({ length: 241 }, (_, i) => -1600 + 20 * i)
const TS = [50, 70, 100, 150, 230, 340, 500, 700, 1000, 1400]

/** Posterior mean of μ and T (T as a geometric mean), on the grid MUS × TS. */
export function posterior(start: { mu: number; T: number }, answers: [string, 0 | 1][]): { mu: number; T: number } {
  const lp = MUS.map(m => TS.map(t => -(((m - start.mu) / 400) ** 2) / 2 - (Math.log(t / start.T) / Math.log(2)) ** 2 / 2))
  for (const [ch, y] of answers) {
    const e = KANJI[ch].level
    MUS.forEach((m, i) => TS.forEach((t, j) => {
      lp[i][j] += logPhi((y ? 1 : -1) * (m - e) / t)
    }))
  }
  const top = Math.max(...lp.flat())
  let w = 0, m = 0, lt = 0
  MUS.forEach((mu, i) => TS.forEach((t, j) => { const q = Math.exp(lp[i][j] - top); w += q; m += q * mu; lt += q * Math.log(t) }))
  return { mu: m / w, T: Math.exp(lt / w) }
}

export const start = (s: Store) => s.start ?? { mu: BEGINNER, T }

/** Pick a starting level: the prior moves, and the answers so far are read against it. */
export const startAt = (s: Store, l: { mu: number; T: number }): Store => {
  const st = { mu: l.mu, T: l.T }
  return { ...s, start: st, ...(s.answers?.length ? posterior(st, s.answers) : st) }
}

/** After an answer about a kanji: the new posterior. */
export function update(s: Store, el: string, knewIt: boolean): Pick<Store, 'mu' | 'T' | 'answers'> {
  const answers: [string, 0 | 1][] = [...(s.answers ?? []), [el, knewIt ? 1 : 0]]
  return { ...posterior(start(s), answers), answers }
}

/** Share of kanji in text the learner reads: what they have seen, plus what they likely knew before. */
export const reach = (s: Store) =>
  Object.entries(KANJI).reduce((a, [ch, k]) => a + k.freq * (s.cards[ch] ? 1 : pKnown(ch, mu(s), temp(s))), 0)
