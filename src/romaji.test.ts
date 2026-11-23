import { expect, it } from 'vitest'
import { KANJI, reads, romaji } from './data'

it('romaji', () => {
  expect(['ジン', 'ニン', 'ひと', 'ちが.う', 'コウ', 'キョウ', 'ガッ', 'シュウ', 'おも.う', 'ジュウ', 'チョウ', 'あそ.ぶ', 'ケン', 'ゲンイン'].map(r => romaji(r)))
    .toEqual(['jin', 'nin', 'hito', 'chigau', 'kō', 'kyō', 'ga', 'shū', 'omou', 'jū', 'chō', 'asobu', 'ken', "gen'in"])
})

it('takes a typed reading in romaji or kana, strict on long vowels', () => {
  for (const [typed, kana] of [['nihongo', 'にほんご'], ['nihonngo', 'にほんご'], ['NIHONGO', 'にほんご'], ['にほんご', 'にほんご'], ['ニホンゴ', 'にほんご'],
    ['gakkou', 'がっこう'], ['gakkō', 'がっこう'], ['matcha', 'まっちゃ'], ['maccha', 'まっちゃ'], ['zyuu', 'じゅう'], ['jyuu', 'じゅう'], ['juu', 'じゅう'],
    ['toukyou', 'とうきょう'], ['tōkyō', 'とうきょう'], ['onna', 'おんな'], ["on'na", 'おんな'], ['onnna', 'おんな'], ["shin'ai", 'しんあい'], ['shinnai', 'しんあい'],
    ['genin', 'げんいん'], ['genin', 'げにん'], ['tsuzuku', 'つづく'], ['tuduku', 'つづく'], ['hu', 'ふ'], ['sensei', 'せんせい'], ['ookii', 'おおきい'], ['ōkii', 'おおきい'],
    ['akarui', 'あか.るい'], ['kon\'yaku', 'こんやく'], ['konnyaku', 'こんにゃく'], ['biiru', 'ビール']])
    expect(reads(typed, kana), `${typed} = ${kana}`).toBe(true)
  for (const [typed, kana] of [['tokyo', 'とうきょう'], ['gako', 'がっこう'], ['nihon', 'にほんご'], ['nihongoo', 'にほんご'], ['obasan', 'おばあさん'], ['kite', 'きって'], ['', 'に']])
    expect(reads(typed, kana), `${typed} ≠ ${kana}`).toBe(false)
})

it('takes letters as an input method or a phone gives them, and a line of macrons at once', () => {
  for (const [typed, kana] of [['ｍｅｉ', 'めい'], ['ﾒｲ', 'めい'], ['ko\u0304', 'こう'], ['kô', 'こう'], ['on’na', 'おんな'], ['Tōkyō', 'とうきょう'], ['ō', 'おう'], ['ō', 'おお']])
    expect(reads(typed, kana), `${typed} = ${kana}`).toBe(true)
  for (const typed of ['-', '.', ' ', '- -']) expect(reads(typed, 'めい', true), `"${typed}" is nothing typed`).toBe(false)
  const t0 = performance.now()
  expect(reads('ō'.repeat(20), 'おう')).toBe(false)
  expect(reads('Kyō wa Tōkyō kara Kyōto e ikimashō. Sorekara Ōsaka de kōhī o nomimashō', 'きょう', true)).toBe(false)
  expect(performance.now() - t0).toBeLessThan(50)
})

it('finds a reading from its first letters', () => {
  for (const [typed, kana] of [['m', 'めい'], ['me', 'めい'], ['mei', 'めい'], ['sh', 'しょう'], ['sho', 'しょう'], ['shō', 'しょう'], ['ka', 'かんがえる'], ['kan', 'かんがえる'], ['kang', 'かんがえる'], ['gak', 'がっこう'], ['めi', 'めい']])
    expect(reads(typed, kana, true), `${typed}… ${kana}`).toBe(true)
  for (const [typed, kana] of [['mei', 'め'], ['mo', 'めい'], ['shu', 'しょう'], ['x', 'めい']])
    expect(reads(typed, kana, true), `${typed}… ≠ ${kana}`).toBe(false)
})

it('reads back every reading and word of the data as romaji() writes it', () => {
  const all = new Set(Object.values(KANJI).flatMap(k => [...k.on, ...k.kun, ...k.readings.map(r => r.r), ...k.words.map(w => w.r)]))
  const bad = [...all].filter(r => !reads(romaji(r), r) || !reads(romaji(r, false), r))
  expect(bad).toEqual([])
})
