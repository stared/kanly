import { it } from 'vitest'
import { KANJI } from './data'
import { LEVELS, startAt, update, upcoming } from './levels'
import { knewIt, learn, type Store } from './srs'

it('how fast the level is found from a fresh start', () => {
  for (const [truth, from] of [[600, 0], [1200, 0], [1800, 0], [1200, 5], [1800, 6], [900, 9]]) {
    let s: Store = startAt({ cards: {}, log: [] }, LEVELS[from])
    const trace: string[] = []
    for (let i = 1; i <= 40; i++) {
      const el = upcoming(s, 0, 1)[0]
      const k = KANJI[el]
      s = k && k.level < truth ? knewIt(s, el, 0, update(s, el, true)) : learn(s, el, 0, k ? update(s, el, false) : {})
      if ([5, 10, 20, 40].includes(i)) trace.push(`${i}: ${Math.round(s.mu ?? -450)}`)
    }
    console.log('truth', truth, 'from', LEVELS[from].label, trace.join('  '))
  }
})
