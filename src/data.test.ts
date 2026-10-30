import { describe, expect, it } from 'vitest'
import { KANJI, ORDER, POS, extraStrokes, gloss, lookalikes, soundFamily } from './data'
import { DAY, MIN, newCard, schedule } from './srs'

describe('data', () => {
  it('teaches every part before the kanji that uses it (single strokes such as 乙 aside)', () => {
    for (const ch of ORDER.filter(el => KANJI[el])) {
      const walk = (t: typeof KANJI[string]['tree']) => t.kids.forEach(k => {
        if (POS.has(k.el) && !['丿', '丨', '丶', '亅', '乙'].includes(k.el)) expect(POS.get(k.el)!).toBeLessThan(POS.get(ch)!)
        walk(k)
      })
      walk(KANJI[ch].tree)
    }
  })
  it('sums kanji from their direct parts', () => {
    expect(KANJI['明'].sum).toEqual(['日', '月'])
    expect(KANJI['照'].sum).toEqual(['昭', '灬'])
  })
  it('counts strokes the parts leave out', () => {
    expect(extraStrokes(KANJI['白'].tree)).toBe(1)  // 日 + 1 stroke
    expect(extraStrokes(KANJI['明'].tree)).toBe(0)
  })
  it('names parts with the curated gloss', () => {
    expect(gloss('召')).toBe('summon')
    expect(gloss('亻')).toBe('person')
  })
  it('finds sound families that hold', () => {
    expect(soundFamily('晴')?.phonetic).toBe('青')
    expect(soundFamily('召')).toBeUndefined() // 刀 トウ holds for 1 of 3
  })
  it('finds kanji one part apart', () => {
    const alike = lookalikes('待').map(l => l.ch)
    expect(alike).toContain('持')
    expect(alike).toContain('時')
  })
})

describe('srs', () => {
  it('steps through 1 and 10 minutes, then days', () => {
    let c = newCard('日', 0)
    expect(c.due).toBe(MIN)
    c = schedule(c, true, 0); expect(c.due).toBe(10 * MIN)
    c = schedule(c, true, 0); expect(c.ivl).toBe(1)
    c = schedule(c, true, 0); expect(c.ivl).toBe(3)
    c = schedule(c, false, 0); expect(c.ivl).toBe(0); expect(c.due).toBe(MIN)
    expect(DAY).toBe(86_400_000)
  })
})
