import { COMP, KANJI, ORDER, POS, type Tree } from './data'
import type { Store } from './srs'

/*
What to learn next, at any level.

Every kanji has a difficulty `level`: its rank, 0 for the one learners know first (fitted in build_data.py).
A learner who knows about μ kanji knows kanji k with the Fermi–Dirac probability

  p(k) = 1 / (1 + exp((level(k) − μ) / T))

Ranks make the density of states flat, so μ is the number of kanji known; T is how blurred the frontier is,
in kanji (official level lists are blurred by 60–230 against the ranks).

Each kanji not yet seen gets the log-weight

  ln(1 − p)  +  ln f  −  α ln cost  +  τ g

that is: how likely it is new, how much of common vocabulary uses it (f, from wordfreq: unlike character counts,
it does not rank name kanji like 藤 and 阪 high), what its shape takes to learn given what is known
(cost: a known part is one chunk, an unknown one its strokes), and breadth: g is Gumbel noise fixed per kanji,
so τ > 0 samples ∝ weight^(1/τ) and shows easier and harder ones too. τ = 0 takes the best one; for a beginner
(μ → −∞) that is simple-first order.

μ moves with every answer, as an Elo (online Rasch) update: up when a kanji is already known, down when new.
T is fitted to the answers by maximum likelihood once there are 10. It pays off for usefulness: in simulation,
for a learner with a blurred frontier (T = 350) a fixed T = 150 finds 30% less useful kanji in 300 cards,
while the fitted T stays within 3% of knowing the true one, whatever the learner.
*/
export const T = 150
export const ALPHA = 1
export const BEGINNER = -3 * T

/** Starting points: how many kanji someone at each official level knows. */
export const LEVELS: { label: string; mu: number }[] = [
  { label: 'beginner', mu: BEGINNER },
  { label: 'JLPT N5, about 80 kanji', mu: 80 },
  { label: 'JLPT N4, about 250', mu: 250 },
  { label: 'JLPT N3, about 600', mu: 600 },
  { label: 'JLPT N2, about 1000', mu: 1000 },
  { label: 'JLPT N1 or kentei 3級, about 1600', mu: 1600 },
  { label: 'kentei 準2級, about 1950', mu: 1950 },
]
export const BREADTH: { label: string; tau: number }[] = [
  { label: 'focused', tau: 0 },
  { label: 'a little wider', tau: 0.25 },
  { label: 'wide', tau: 0.5 },
  { label: 'very wide', tau: 1 },
]

/** Difficulty of anything learnable: a part is as hard as the easiest kanji using it. */
const LEVEL = new Map<string, number>(ORDER.map(el => [el, KANJI[el]?.level ?? Math.min(...(COMP[el]?.usedIn ?? []).map(c => KANJI[c]?.level ?? Infinity))]))
export const pKnown = (el: string, mu: number, t = T) => 1 / (1 + Math.exp(((LEVEL.get(el) ?? Infinity) - mu) / t))

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
      const w = Math.log(1 - pKnown(ch, m, t) + 1e-12) + Math.log(k.use + 1e-3) - ALPHA * Math.log(cost(k.tree, known)) + tau * gumbel(ch, s.seed ?? 0)
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

/** After an answer about a kanji: an Elo step for μ (big while the level is unknown, settling as answers
 * accumulate), then T by gradient ascent on the likelihood of all answers. */
export function update(s: Store, el: string, knewIt: boolean): Pick<Store, 'mu' | 'T' | 'answers'> {
  const answers: [string, 0 | 1][] = [...(s.answers ?? []), [el, knewIt ? 1 : 0]]
  let t = temp(s)
  const m = mu(s) + Math.max(20, 300 / Math.sqrt(answers.length)) * ((knewIt ? 1 : 0) - pKnown(el, mu(s), t))
  if (answers.length >= 10) {
    for (let i = 0; i < 30; i++) {
      // dℓ/dT = −Σ (y − p)(μ − level) / T²
      const g = answers.reduce((a, [ch, y]) => a + (y - pKnown(ch, m, t)) * (m - KANJI[ch].level), 0) / answers.length
      t = Math.min(600, Math.max(40, t - 2000 * g / t ** 2))
    }
  }
  return { mu: m, T: t, answers }
}

/** Share of kanji in text the learner reads: what they have seen, plus what they likely knew before. */
export const reach = (s: Store) =>
  Object.entries(KANJI).reduce((a, [ch, k]) => a + k.freq * (s.cards[ch] ? 1 : pKnown(ch, mu(s), temp(s))), 0)
