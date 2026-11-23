import { expect, it } from 'vitest'
import words from './data/words.json'
import { fit, index, tokenize, type Entry } from './tokens'

const ix = index(words as Entry[])
/** The dictionary words a text is read as, each kanji token once. */
const read = (text: string) => tokenize(text, ix).filter(t => t.entry).map(t => t.entry![0])

it('reads an inflected verb or adjective as its own word, not as another of the same stem', () => {
  expect(read('大きな都市に住んでいます')).toEqual(['大きな', '都市', '住む'])
  expect(read('山が見える。山を見ます。本を見せて')).toEqual(['山', '見える', '山', '見る', '本', '見せる'])
  expect(read('色が変わります。色を変えた')).toEqual(['色', '変わる', '色', '変える'])
  expect(read('桜が咲き、花が咲いた')).toEqual(['桜', '咲く', '花', '咲く'])
  expect(read('学校に行きます。東京行きの電車')).toEqual(['学校', '行く', '東京', '行き', '電車'])
  expect(read('赤くなる。人が多かった')).toEqual(['赤い', '人', '多い'])
  expect(read('食べました。帰ってきた')).toEqual(['食べる', '帰る'])
})

it('keeps a noun a noun before a particle', () => {
  expect(read('人が多くの人に')).toEqual(['人', '多く', '人'])
  expect(read('日本は東アジアにある')).toEqual(['日本', '東'])
})

it('scores how a word accounts for the kana after its stem', () => {
  expect(fit('む', 'んでいます')).toBeGreaterThan(fit('まい', 'んでいます'))
  expect(fit('る', 'ます')).toBeGreaterThan(fit('える', 'ます'))
  expect(fit('まい', 'の')).toBe(0)
})
