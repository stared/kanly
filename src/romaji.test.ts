import { expect, it } from 'vitest'
import { romaji } from './data'

it('romaji', () => {
  expect(['ジン', 'ニン', 'ひと', 'ちが.う', 'コウ', 'キョウ', 'ガッ', 'シュウ', 'おも.う', 'ジュウ', 'チョウ', 'あそ.ぶ', 'ケン', 'ゲンイン'].map(r => romaji(r)))
    .toEqual(['jin', 'nin', 'hito', 'chigau', 'kō', 'kyō', 'ga', 'shū', 'omou', 'jū', 'chō', 'asobu', 'ken', "gen'in"])
})
