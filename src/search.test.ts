import { expect, it } from 'vitest'
import { COMP, KANJI } from './data'
import { rank } from './Browse'

const ALL = [...Object.keys(KANJI), ...Object.keys(COMP).filter(el => !KANJI[el])]
/** What a search finds, best first (ties in the order of the data). */
const find = (q: string) => ALL.map(el => [el, rank(el, q)] as const).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(x => x[0])

it('finds a kanji by a character, typed alone or pasted in a word', () => {
  expect(find('明')).toEqual(['明'])
  expect(find('亻')).toEqual(['亻'])
  expect(find('明日は晴れ').sort()).toEqual(['日', '明', '晴'].sort())
})

it('finds a kanji by meaning: the card\'s own, the dictionary\'s, a phrase; a full match first', () => {
  expect(find('sun')[0]).toBe('日')
  expect(find('Sun')).toEqual(find('sun'))
  expect(find('bright')).toContain('明')
  expect(find('brig')).toContain('明')
  expect(find('student')).toContain('生')  // on the card, not in KANJIDIC
  expect(find('to eat')).toContain('食')
  expect(find('eat')[0]).toBe('食')
  expect(find('xyzzy')).toEqual([])
})

it('finds a kanji by reading, in kana or romaji, whole readings before longer ones', () => {
  for (const q of ['めい', 'メイ', 'mei']) expect(find(q), q).toEqual(expect.arrayContaining(['名', '明', '命']))
  expect(find('めい').every(c => KANJI[c].on.includes('メイ') || KANJI[c].kun.some(r => r.replace(/[.-]/g, '').startsWith('めい')))).toBe(true)
  expect(find('nichi')).toEqual(['日'])
  expect(find('akarui')).toEqual(['明'])
  expect(find('あか.るい')).toEqual(['明'])
  const hi = find('hi')
  expect(hi.indexOf('日')).toBeLessThan(hi.indexOf('人'))  // ひ in full, before ひと
  expect(hi.indexOf('火')).toBeLessThan(hi.indexOf('人'))
  expect(find('mizu')[0]).toBe('水')
})

it('takes a search as it comes: off the card, with an article, full-width, with a stray comma', () => {
  expect(rank('日', 'day; sun')).toBe(5)
  expect(rank('日', 'day, sun')).toBe(5)
  expect(rank('日', 'the sun')).toBe(5)
  expect(rank('日', 'sun,')).toBe(5)
  expect(rank('明', 'ｍｅｉ')).toBe(4)
  expect(rank('明', 'ﾒｲ')).toBe(4)
  expect(find('-')).toEqual([])
  expect(find('..')).toEqual([])
})

it('keeps a reading a reading: a macron or kana finds no English word, and no kana-shaped part', () => {
  expect(find('tō').every(c => [1, 4].includes(rank(c, 'tō')))).toBe(true)  // found by reading alone
  expect(find('jū').length).toBeLessThan(40)
  expect(find('マン')[0]).not.toBe('マ')
  expect(find('マン')).toContain('万')
  expect(find('マ')[0]).toBe('マ')  // typed alone, it is the part
})

it('ranks whole words of a meaning over the start of one, also for a phrase', () => {
  const some = find('counter for')
  expect(some.length).toBeGreaterThan(10)
  expect(Math.max(...some.map(c => rank(c, 'counter for')))).toBe(3)
})
