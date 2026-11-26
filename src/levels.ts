import { COMP, D, KANJI, ORDER, POS, extraStrokes, type Tree } from './data'
import { B, recall, status, weakest, type Answer, type Aspect, type Status, type Store } from './srs'

/*
What to learn next, at any level.

Every kanji has a difficulty rank, 0 for the one learners know first, in an order that mixes the curriculum and
frequency (λ, see LAMBDAS; both fitted in build_data.py).
A learner who knows about μ kanji knows kanji k with probability

  p(k) = Φ((μ − level(k)) / T)

a step at μ blurred by a Gaussian of width T: a Fermi sea with disorder rather than heat. Ranks make the
density of states flat, so μ is the number of kanji known. On the official lists a Gaussian edge fits slightly
better than the Fermi–Dirac one, 1 / (1 + e^((level − μ)/T)), and its tail is lighter: a list missing a kanji
500 ranks below its edge happens about once in 500, which the Fermi tail overestimates 10 times, and that tail
is what made someone who knows 1000 kanji get asked about 人. Official lists are blurred by T = 110–530.

Each kanji not yet seen gets the weight: expected usefulness per expected effort,

  w = (1 − p) f / ((1 − p) cost^α + p ρ)       (in logs, plus τ g)

f is its share of all kanji in running text (wordfreq), as on the card's "% of text": what a reader meets, verb
forms included (食べて, 言った).
cost is what its shape takes to learn given what is known: a known part is one chunk, an
unknown one its strokes. ρ is the effort of a quiz on a kanji already known, relative to learning a one-chunk kanji. A known
card is cheap, so a frequent kanji is worth showing even if it is probably known: in simulation, with ρ = 0.3,
this finds 13–34% more useful kanji per unit of effort than counting cards, at about 2 cards shown per new one.
(ρ = 0.1 gains more, but asks someone who knows 1000 kanji whether they know 人.) g is Gumbel noise fixed per kanji: τ > 0 samples ∝ w^(1/τ), so easier and harder
ones show up too. τ = 0 takes the best one; for a beginner (p ≈ 0) that is frequency order, each kanji after its parts. Variety has a price:
in simulation τ = 0.25, 0.5, 1 learn 3%, 10%, 25% less usefulness per effort, even when the difficulty ranks are
off by ±400 for the learner (the posterior already makes uncertain, useful kanji worth checking).

λ, μ and T come from the posterior given the quiz answers so far (right = 1, else 0, allowing a lucky guess and a
slip), computed exactly
on a grid, with a prior centred on the starting level picked (a list's μ, give or take 400; its T within a
factor of 2). Fitting T pays off: in simulation, for a learner with a blurred frontier (T = 350) a fixed
T = 150 finds 30% less useful kanji in 300 cards, while a fitted T stays within 3% of the true one. Fitting λ gives a
reader 30–34% more usefulness in 150 quiz cards than a fixed λ = 0.5, a course learner 7–19%.

Two edges, not one. A kanji is known by its meaning and by its reading, and one often runs ahead of the other (who
reads Chinese, or learned kanji by keywords, knows what most mean and how few are read). So there is an edge for each,
μ_m and μ_r, in the same order and with the same blur:

  p_m(k) = Φ((μ_m − level(k)) / T)        p_r(k) = Φ((μ_r − level(k)) / T)

and a kanji is known in both, which is what μ and p above are about, up to the lower of the two. The first quiz asks
both, and each answer is evidence about its own edge. Before any answer the two are the same, a lead of n kanji
exp(−n / LEAD) as likely as none (LEAD = 300); 20 answers with the meaning right and the reading wrong move them
apart by hundreds (levels.test.ts).
*/
export const T = 260
export const ALPHA = 0  // how much strokes count as effort: 0 = by frequency alone (parts still come first), 1 = per stroke
export const RHO = 0.3
export const BEGINNER = -450
export const SURE = 0.9

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

/** Two orders of difficulty, both ranks: by curriculum (`level`, what courses teach first) and by frequency
 * (`flevel`, what reading meets first: 俺 and 誰 are taught late but met early). A learner's order is a mix,
 * λ = 0 the curriculum, 1 frequency, fitted from her answers with μ and T. Ranks keep μ the number known for any λ. */
export const LAMBDAS = [0, 0.25, 0.5, 0.75, 1]
export const LAMBDA = 0.5
const BY = LAMBDAS.map(l => Object.keys(KANJI).sort((a, b) =>
  (1 - l) * KANJI[a].level + l * KANJI[a].flevel - (1 - l) * KANJI[b].level - l * KANJI[b].flevel || KANJI[a].level - KANJI[b].level))
/** Difficulty of anything learnable, per λ: a part is as hard as the easiest kanji using it. */
const LEVEL = BY.map(order => {
  const at = new Map(order.map((c, i) => [c, i]))
  return new Map<string, number>(ORDER.map(el => [el, at.get(el) ?? Math.min(...(COMP[el]?.usedIn ?? []).map(c => at.get(c) ?? Infinity))]))
})
const li = (lam: number) => LAMBDAS.reduce((b, l, i) => Math.abs(l - lam) < Math.abs(LAMBDAS[b] - lam) ? i : b, 0)
/** Kanji from easiest to hardest, for a mix λ. */
export const byLevel = (lam = LAMBDA) => BY[li(lam)]
export const levelOf = (el: string, lam = LAMBDA) => LEVEL[li(lam)].get(el) ?? Infinity

/** ln Φ(z), the log of the standard normal CDF, accurate in the far left tail (erfc as in Numerical Recipes). */
export function logPhi(z: number): number {
  const x = -z / Math.SQRT2, t = 1 / (1 + 0.5 * Math.abs(x))
  const ln = Math.log(t) - x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))  // ln erfc(|x|)
  return x >= 0 ? ln - Math.LN2 : Math.log1p(-Math.exp(ln) / 2)
}
export const Phi = (z: number) => Math.exp(logPhi(z))
export const pKnown = (el: string, mu: number, t = T, lam = LAMBDA) => Phi((mu - levelOf(el, lam)) / t)

/** Fixed noise per kanji, the same every visit, so the upcoming list does not jump around. */
const gumbel = (el: string, seed: number) => {
  let h = 2166136261 ^ seed
  for (const c of el) h = Math.imul(h ^ c.codePointAt(0)!, 16777619)
  const u = ((h >>> 0) + 0.5) / 2 ** 32
  return -Math.log(-Math.log(u))
}

const chunks = (t: Tree, known: (el: string) => boolean): number =>
  known(t.el) ? 1 : cost(t, known)

/** What a kanji's shape takes to learn: its own extra strokes plus a chunk or the strokes of each part. */
export const cost = (t: Tree, known: (el: string) => boolean): number =>
  !t.kids.length ? t.strokes : extraStrokes(t) + t.kids.reduce((a, k) => a + chunks(k, known), 0)

const walk = (t: Tree, out: Set<string>) => { out.add(t.el); t.kids.forEach(k => walk(k, out)) }

/** How many kanji were known before: meaning and reading both, or the one asked for (of). */
export const mu = (s: Store, of?: Aspect) => (of && s.mus ? s.mus[of] : s.mu) ?? BEGINNER
export const temp = (s: Store) => s.T ?? T
export const lam = (s: Store) => s.lam ?? LAMBDA
/** p(known) for this learner: meaning and reading both, or the one asked for (of). */
export const pOf = (s: Store, el: string, of?: Aspect) => pKnown(el, mu(s, of), temp(s), lam(s))

/*
One queue. What is asked next is one item, never seen or seen before: the one with the largest weight, in logs plus
τ g as above.

A kanji never seen has the weight above: f (1 − p) over the effort, p the chance it was known before.

A card's turn comes as its recall (srs.ts) falls: that of its meaning or of its reading, whichever is weaker. With q the
recall lost, 1 − exp(−t/s), its weight is

  w = f exp(−(q̂ − q) / δ)   while q < q̂,      w = f (1 + q − q̂)   from then on.

Until its recall has fallen by q̂ a card is put off exponentially (a Boltzmann factor, δ its temperature in units
of recall); from then on it goes before any new kanji no more often written. A card written r times more often
than the next new kanji comes up ln(r) δ sooner: at q̂ = 0.07, δ = 0.01 the most written kanji are asked at about
97% recall, the rarest at 93%.

Why q̂ and not the recall at which a question does the most for the memory: a recall at chance 1 − q multiplies
the memory time by 1 + B q, so the memory gained per effort, (1 − q) ln(1 + B q) / (q + (1 − q) ρ), peaks at
q* ≈ 0.2 (Q_BEST). But a learner comes back once a day, not at the best moment, and what waits a day at q = 0.2
is often gone. Simulated (memory.test.ts: 40 units of effort a day for 120 days, memory following srs.ts;
GRID=1 prints the other values tried), read at the start of a session:

                                        cards   text on cards readable   questions on cards failed
  a beginner            ladder            404   63%                       39%
                        q̂ = 0.07          710   81%                       24%
                        q̂ = 0.2           625   74%                       39%
  knows 800 kanji       ladder            650   13%                       54%
  (400 never asked)     q̂ = 0.07          966   24%                       21%

δ has to stay well under q̂: at δ = 0.02 with q̂ = 0.05 the most written cards are asked over and over at more
than 95% recall and little new is learned. The ladder is the scheduler this replaced: 1 minute, 10 minutes, a
day, then × 2.5, whatever is due first. The memory simulated is the model's own, so this shows the queue uses
the model well, not that the model is right about people.
*/
const effortOf = (q: number, teach = 1) => q * teach + (1 - q) * RHO
/** The recall lost, q*, at which asking a card gains the most memory per effort (for the record: the queue asks sooner). */
export const Q_BEST = Array.from({ length: 99 }, (_, i) => (i + 1) / 100)
  .reduce((best, q) => (1 - q) * Math.log(1 + B * q) / effortOf(q) > (1 - best) * Math.log(1 + B * best) / effortOf(best) ? q : best, 0.01)
/** The recall lost at which a card's turn comes, and how sharply it is put off before that. */
export const Q_ASK = 0.07
export const DELTA = 0.01

/** ln of the weight of a kanji never seen, of use f, not known with chance q, that takes `teach` to learn. */
export const lnNew = (f: number, q: number, teach: number) => Math.log(f * 1e6 + 1e-3) + Math.log(q + 1e-30) - Math.log(effortOf(q, teach))
/** ln of the weight of a card of use f whose recall has fallen by q. */
export const lnCard = (f: number, q: number, delta = DELTA, at = Q_ASK) => Math.log(f * 1e6 + 1e-3) - Math.max(0, at - q) / delta + Math.log(1 + Math.max(0, q - at))

/** The use of reading an item: a kanji's share of the kanji in text; for a part, that of the most written kanji it is in. */
const use = (el: string) => KANJI[el]?.freq ?? Math.max(0, ...(COMP[el]?.usedIn ?? []).map(c => KANJI[c]?.freq ?? 0))

/** What to ask now: a card (seen: true) or the next new item. `of` narrows the choice, the weights unchanged:
 * no new items (fresh: false), or only the cards `card` lets through. */
export function next(s: Store, now: number, tau = s.tau ?? 0, of: { fresh?: boolean; card?: (id: string) => boolean } = {}): { el: string; seen: boolean } | undefined {
  const { els, w } = of.fresh === false ? { els: [], w: -Infinity } : fresh(s, tau, 1)
  let best = '', top = -Infinity
  for (const c of Object.values(s.cards)) {
    if (of.card && !of.card(c.id)) continue
    // the noise changes with every answer, or the same card would be favoured for good
    const v = lnCard(use(c.id), 1 - weakest(c, now)) + tau * gumbel(c.id, (s.seed ?? 0) + c.reps + 1)
    if (v > top) { top = v; best = c.id }
  }
  if (best && (top > w || !els.length)) return { el: best, seen: true }
  return els.length ? { el: els[0], seen: false } : undefined
}

/** The next few items to learn: a kanji, preceded by the parts it needs that are likely new. */
export const upcoming = (s: Store, tau: number, n = 9): string[] => fresh(s, tau, n).els

/** The same, with the weight of the first kanji among them (−∞ when there is nothing left to learn). */
function fresh(s: Store, tau: number, n: number): { els: string[]; w: number } {
  const m = mu(s), t = temp(s), l = lam(s)
  const seen = new Set(Object.keys(s.cards))
  const shapes = new Set<string>()
  seen.forEach(id => KANJI[id] ? walk(KANJI[id].tree, shapes) : shapes.add(id))
  const known = (el: string) => shapes.has(el) || pKnown(el, m, t, l) >= 0.5
  const out: string[] = []
  let first = -Infinity
  while (out.length < n) {
    let best = '', top = -Infinity
    for (const [ch, k] of Object.entries(KANJI)) {
      if (seen.has(ch)) continue
      // very likely known: not worth a card, however useful (an N2 learner is never asked about 時)
      const p = pKnown(ch, m, t, l)
      if (p > SURE) continue
      const w = lnNew(k.freq, 1 - p, cost(k.tree, known) ** ALPHA) + tau * gumbel(ch, s.seed ?? 0)
      if (w > top) { top = w; best = ch }
    }
    if (!best) break
    if (!out.length) first = top
    const parts = new Set<string>()
    walk(KANJI[best].tree, parts)
    // a part that is not a kanji gets its own card only for beginners, and only if it recurs: 卜 (上 外 占 …)
    const need = [...parts].filter(el => el !== best && POS.has(el) && !seen.has(el) && !known(el) && (KANJI[el] || (m <= BEGINNER && (COMP[el]?.usedIn.length ?? 0) >= 2)))
      .sort((a, b) => POS.get(a)! - POS.get(b)!)
    for (const el of [...need, best]) { out.push(el); seen.add(el) }
    walk(KANJI[best].tree, shapes)
  }
  return { els: out.slice(0, n), w: first }
}

export const MUS = Array.from({ length: 241 }, (_, i) => -1600 + 20 * i)
export const TS = [50, 70, 100, 150, 230, 340, 500, 700]  // wider would let a few careless answers blur everything
/** A quiz answered right without knowing the kanji: a guess among 4 meanings, then among 4 readings; and a slip. */
export const GUESS = 1 / 16, SLIP = 0.03
/** How far one edge runs ahead of the other before any answer says: a lead of n kanji is exp(−n / LEAD) as likely as none. */
export const LEAD = 300

/** ln(e^a + e^b). */
const lse = (a: number, b: number) => a === -Infinity ? b : b === -Infinity ? a : Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b)))

/** Posterior over λ, T and the two edges, of meaning and of reading, given the answers: λ the most probable mix, T its
 * posterior mean (geometric), mu that of the lower edge (the kanji known in both), mus the two edges: the lower one at
 * mu, the other ahead of it by the mean lead, so that nothing is ahead when no answer says which is.
 *
 * Exact on the grid, in a time linear in it. An answer about the meaning says where μ_m is, one about the reading where
 * μ_r is; one saved before the two were told apart (both right or not) says where the lower edge is, as it did then:
 * with such answers alone the fit is the one it was. The prior is on the lower edge (the level picked, give or take
 * 400) and on the lead, so the weight of a pair of edges is a product of a term in the lower and a term in the upper,
 * and the sums over pairs are running sums. */
export function posterior(start: { mu: number; T: number }, answers: Answer[]): { mu: number; T: number; lam: number; mus: Record<Aspect, number> } {
  const n = MUS.length, k = (MUS[1] - MUS[0]) / LEAD
  // the prior of the lower edge, whatever the grid leaves of leads above it: ln of exp(−k d) summed over the leads d ≥ 0 of one edge and d > 0 of the other
  const room = MUS.map((_, i) => Math.log(2 * (1 - Math.exp(-k * (n - i))) / (1 - Math.exp(-k)) - 1))
  const fits = LAMBDAS.map(l => {
    const es = answers.map(([ch]) => levelOf(ch, l))
    return TS.map(t => {
      // ln of what says where the lower edge is (lo), the meaning's (m) and the reading's (r), at each μ of the grid
      const lo = MUS.map((x, i) => -(((x - start.mu) / 400) ** 2) / 2 - room[i]), m = MUS.map(() => 0), r = MUS.map(() => 0)
      answers.forEach(([, a, b], q) => MUS.forEach((x, i) => {
        const p = Phi((x - es[q]) / t)
        if (b === undefined) { const right = p * (1 - SLIP - GUESS) + GUESS; lo[i] += Math.log(a ? right : 1 - right); return }
        const right = p * (1 - SLIP / 2 - Math.sqrt(GUESS)) + Math.sqrt(GUESS), wrong = Math.log(1 - right), ok = Math.log(right)
        m[i] += a ? ok : wrong
        r[i] += b ? ok : wrong
      }))
      // the lower edge at i: the meaning's, with the reading's at i or above (A), or the reading's, the meaning's above (B)
      const A = MUS.map(() => 0), B = MUS.map(() => 0), M = MUS.map(() => 0), R = MUS.map(() => 0)
      let above = -Infinity, over = -Infinity  // the reading at i or above; the meaning above i
      for (let i = n - 1; i >= 0; i--) {
        above = lse(above, r[i] - k * i)
        A[i] = lo[i] + m[i] + k * i + above
        B[i] = lo[i] + r[i] + k * i + over
        over = lse(over, m[i] - k * i)
      }
      // each edge at i: as the lower one, or above a lower one (the meaning strictly above, the reading at or above)
      let under = -Infinity, upto = -Infinity, z = -Infinity
      for (let i = 0; i < n; i++) {
        upto = lse(upto, lo[i] + m[i] + k * i)
        M[i] = lse(A[i], m[i] - k * i + under)
        R[i] = lse(B[i], r[i] - k * i + upto)
        under = lse(under, lo[i] + r[i] + k * i)
        z = lse(z, lse(A[i], B[i]))
      }
      const mean = (ln: (i: number) => number) => MUS.reduce((a, x, i) => a + x * Math.exp(ln(i) - z), 0)
      return { t, z: z - (Math.log(t / start.T) / Math.log(2)) ** 2 / 2, lo: mean(i => lse(A[i], B[i])), m: mean(i => M[i]), r: mean(i => R[i]) }
    })
  })
  const top = Math.max(...fits.flat().map(c => c.z))
  const by = fits.map(cells => {
    let w = 0, lo = 0, lead = 0, lt = 0
    for (const c of cells) { const q = Math.exp(c.z - top); w += q; lo += q * c.lo; lead += q * (c.m - c.r); lt += q * Math.log(c.t) }
    return { w, mu: lo / w, lead: lead / w, T: Math.exp(lt / w) }
  })
  const a = by.reduce((b, f, i) => f.w > by[b].w ? i : b, 0), { mu, T } = by[a]
  const lead = Math.abs(by[a].lead) < 1e-6 ? 0 : by[a].lead  // none, where it is the rounding of sums that are equal
  return { mu, T, lam: answers.length ? LAMBDAS[a] : LAMBDA, mus: { m: mu + Math.max(0, lead), r: mu + Math.max(0, -lead) } }
}

export const start = (s: Store) => s.start ?? { mu: BEGINNER, T }

/** Pick a starting level: the prior moves, and the answers so far are read against it. */
export const startAt = (s: Store, l: { mu: number; T: number }): Store => {
  // a list is blurrier than a person who passed it (N2: T = 412), so start sharper and let answers widen it
  const st = { mu: l.mu, T: Math.min(l.T, 200) }
  return { ...s, start: st, ...(s.answers?.length ? posterior(st, s.answers) : { ...st, lam: undefined, mus: undefined }) }
}

/** After a kanji's first quiz, its meaning right or not, its reading right or not: the new posterior. */
export function update(s: Store, el: string, meaning: boolean, reading = meaning): Pick<Store, 'mu' | 'T' | 'lam' | 'mus' | 'answers'> {
  const answers: Answer[] = [...(s.answers ?? []), [el, meaning ? 1 : 0, reading ? 1 : 0]]
  return { ...posterior(start(s), answers), answers }
}

/** How an item stands with this learner, by its meaning or its reading (of), or by the weaker of the two. With a card:
 * learning or known. Without one: assumed, if the level fitted to their answers makes it more likely known than not,
 * else new. Someone who starts at N2 is never asked about 日 (p > SURE) and is asked sooner or later about a kanji
 * nearer their edge; until then both are assumed, not new. */
export type Standing = Status | 'assumed'
export const standing = (s: Store, el: string, of?: Aspect): Standing => s.cards[el] ? status(s, el, of) : pOf(s, el, of) > 0.5 ? 'assumed' : 'new'

/** The same as the class names of a tile: how the meaning stands, and how the reading does (r-) where it stands otherwise. */
export const marks = (s: Store, el: string): string => {
  const m = standing(s, el, 'm'), r = standing(s, el, 'r')
  return m === r ? m : `${m} r-${r}`
}

/** Share of the kanji in text the learner knows now, by meaning and by reading: each card by its chances of recall, the
 * rest by the chance it was known before. */
export const reach = (s: Store, now = Date.now()) => {
  let meaning = 0, reading = 0
  for (const [ch, k] of Object.entries(KANJI)) {
    const c = s.cards[ch]
    meaning += k.freq * (c ? recall(c.m, now) : pOf(s, ch, 'm'))
    reading += k.freq * (c ? recall(c.r ?? c.m, now) : pOf(s, ch, 'r'))
  }
  return { meaning, reading }
}
