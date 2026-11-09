import { describe, expect, it } from 'vitest'
import { KANJI } from './data'
import { pKnown, update, upcoming } from './levels'
import { knewIt, learn, type Store } from './srs'

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
