import { expect, it } from 'vitest'
import { KANJI } from './data'
import { meaningOptions, readingOptions } from './Quiz'

it('every kanji gets 4 meanings and 4 reading profiles to choose from', () => {
  const short = Object.keys(KANJI).filter(ch => meaningOptions(ch).length < 4 || readingOptions(ch).length < 4)
  for (const ch of ['誰', '待', '人', '日', '勉', '鬱', '生']) console.log(ch, meaningOptions(ch).map(c => KANJI[c].keyword).join(' | '), ' / ', readingOptions(ch).map(c => c + KANJI[c].readings[0].r).join(' '))
  expect(short).toEqual([])
})
