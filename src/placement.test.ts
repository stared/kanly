import { expect, it } from 'vitest'
import { KANJI } from './data'
import { GUESS, LEVELS, levelOf, startAt, update, upcoming } from './levels'
import { knewIt, learn, type Store } from './srs'

/** A simulated learner: knows the `truth` easiest kanji in the order mixed by λ, and guesses when not (1 in 16 right). */
function run(truth: number, lam: number, from: number, n = 60) {
  let s: Store = startAt({ cards: {}, log: [] }, LEVELS[from])
  let x = 1
  const rand = () => (x = (x * 16807) % 2147483647) / 2147483647
  const trace: string[] = []
  for (let i = 1; i <= n; i++) {
    const el = upcoming(s, 0, 1)[0]
    const right = !!KANJI[el] && (levelOf(el, lam) < truth || rand() < GUESS)
    s = right ? knewIt(s, el, 0, update(s, el, true)) : learn(s, el, 0, KANJI[el] ? update(s, el, false) : {})
    if ([10, 20, 40, 60].includes(i)) trace.push(`${i}: μ ${Math.round(s.mu ?? -450)} λ ${s.lam}`)
  }
  console.log(`truth ${truth} λ ${lam} from ${LEVELS[from].label}:`, trace.join('  '))
  return s
}

it('finds the level and whether a learner follows courses or reading', () => {
  for (const [truth, lam, from] of [[1000, 0, 4], [1000, 1, 4], [1600, 0, 4], [1600, 1, 4], [600, 1, 0], [1800, 0.5, 9]]) {
    const s = run(truth, lam, from)
    expect(Math.abs(s.mu! - truth)).toBeLessThan(250)
    expect(Math.abs(s.lam! - lam)).toBeLessThanOrEqual(0.5)
  }
}, 30_000)  // a few seconds of simulated quizzes
