import { expect, it } from 'vitest'
import { KANJI } from './data'
import { standing, startAt } from './levels'
import { answer, knewIt, learn, type Store } from './srs'
import { accepted, ask, entries, glosses, meant, readAs, reviewWord } from './words'

const blank: Store = { cards: {}, log: [] }

it('takes a typed meaning as the gloss, an alternative of it, with or without what is in brackets', () => {
  expect(accepted('Japanese (language)')).toEqual(['japanese', 'japanese language'])
  expect(accepted("(one's) life")).toEqual(['life', "one's life"])
  expect(accepted('truth; real')).toEqual(['truth', 'real'])
  expect(accepted('to open (a door, box)')).toEqual(['open', 'open a door box'])
  expect(accepted('hand; move, means')).toEqual(['hand', 'move means'])
  expect(accepted('food, clothing and shelter')).toEqual(['food clothing and shelter'])
  expect(accepted('10,000 yen (on banknotes)')).toEqual(['10000 yen', '10000 yen on banknotes'])
  for (const [typed, gloss] of [['Japan', 'Japan'], [' japan ', 'Japan'], ['japanese', 'Japanese (language)'], ['Japanese language', 'Japanese (language)'],
    ['life', "(one's) life"], ['real', 'truth; real'], ['read a book', 'to read a book'], ['to decrease', 'decrease'], ['the teacher', 'teacher'],
    ['explanaton', 'explanation'], ['recieve', 'receive'], ['Japan US', 'Japan-US'], ['mountain forrest', 'mountain forest'],
    ['truth, real', 'truth; real'], ['real; truth', 'truth; real'], ['food, clothing and shelter', 'food, clothing and shelter'], ['10,000 yen', '10,000 yen (on banknotes)'],
    ['10000 yen', '10,000 yen (on banknotes)'], ['cafe', 'café'], ['joyo kanji', 'jōyō kanji'], ['impossable', 'impossible']])
    expect(meant(typed, gloss), `${typed} = ${gloss}`).toBe(true)
  for (const [typed, gloss] of [['', 'Japan'], ['   ', 'Japan'], ['China', 'Japan'], ['form', 'from'], ['sun', 'Sunday'], ['forest', 'mountain forest'], ['language', 'Japanese (language)'], ['sun-origin', 'Japan'],
    // not typos: the opposite, another word, half a list, a right meaning beside a wrong one
    ['possible', 'impossible'], ['necessary', 'unnecessary'], ['convenient', 'inconvenient'], ['height', '(body) weight'], ['cousin male', 'cousin (female)'],
    ['gradual increase', 'gradual decrease'], ['food', 'food, clothing and shelter'], ['10', '10,000 yen (on banknotes)'], ['truth, lie', 'truth; real']])
    expect(meant(typed, gloss), `${typed} ≠ ${gloss}`).toBe(false)
})

it('asks a kanji whose memory has reached a day through a word of known kanji, a different one each time', () => {
  expect(reviewWord(blank, '本')).toBeUndefined()  // no card
  const fresh = learn(blank, '本', 0)
  const two = (s: Store) => learn(s, '日', 0)
  expect(reviewWord(fresh, '本')).toBeUndefined()  // a memory of minutes: asked by itself
  // a memory of days, but a beginner knows no other kanji: no word to ask
  const days = (s: Store): Store => ({ ...s, cards: { ...s.cards, 本: { ...s.cards['本'], m: { s: 3, t: 0 }, r: { s: 3, t: 0 }, reps: 3 } } })
  const alone = days(fresh)
  // the meaning remembered for days, the reading for minutes: still asked by itself
  expect(reviewWord({ ...two(alone), cards: { ...two(alone).cards, 本: { ...alone.cards['本'], r: { s: 0.01, t: 0 } } } }, '本')).toBeUndefined()
  expect(reviewWord(alone, '本')).toBeUndefined()
  // with 日 seen too, the two words of 日 and 本 alone can be asked, in turn
  const both = two(alone)
  const at = (reps: number) => reviewWord({ ...both, cards: { ...both.cards, 本: { ...both.cards['本'], reps } } }, '本')?.w
  expect([at(4), at(5), at(6)]).toEqual(['日本', '本日', '日本'])
  // someone who started at N2 knew 本 at the first quiz: its other kanji are assumed known
  const n2 = knewIt(startAt(blank, { mu: 1200, T: 200 }), '本', 0)
  const seen = new Set<string>()
  let s = n2
  for (let i = 0; i < 6; i++) {
    const w = reviewWord(s, '本')!
    expect([...w.w].length).toBeGreaterThanOrEqual(2)
    expect(w.w).toMatch(/^[\p{Script=Han}々]+$/u)
    expect([...w.w].every(c => c === '本' || standing(s, c) !== 'new')).toBe(true)
    expect(w.w).toContain('本')
    seen.add(w.w)
    s = answer(s, '本', true, true, 0)
  }
  expect(seen.size).toBe(6)
  expect(reviewWord(answer(n2, '本', false, false, 0), '本')).toBeUndefined()  // failed: back to the kanji itself
  expect(reviewWord(answer(n2, '本', true, false, 0), '本')).toBeUndefined()   // the reading alone failed: the same
})

it('takes either reading of a word that has two, and asks the meaning of the one typed', () => {
  const momiji = KANJI['葉'].words.find(w => w.w === '紅葉')!
  const both = entries('葉', momiji)
  expect(both.map(w => w.r).sort()).toEqual(['こうよう', 'もみじ'])
  expect(readAs('momiji', both)?.r).toBe('もみじ')
  expect(readAs('kouyou', both)?.r).toBe('こうよう')
  expect(readAs('kōyō', both)?.r).toBe('こうよう')
  expect(readAs('koyo', both)).toBeUndefined()
})

it('has a word to review nearly every kanji by, for someone who knows them all', () => {
  const all = startAt(blank, { mu: 2136, T: 100 })
  const none = Object.keys(KANJI).filter(c => !reviewWord(knewIt(all, c, 0), c))
  expect(none.length).toBeLessThan(40)
})

it('takes a word\'s meaning from the card of any of its kanji, and asks words with a kanji outside the usual block', () => {
  const on = (c: string) => KANJI[c].words.find(w => w.w === '休日')!
  expect(glosses(on('休'))).toEqual(expect.arrayContaining([on('休').g, on('日').g]))
  expect(meant(on('日').g.split(';')[0], ...glosses(on('休')))).toBe(true)
  const all = startAt(blank, { mu: 2136, T: 100 })
  const scold = knewIt(all, '𠮟', 0)
  expect(Array.from({ length: 12 }, (_, reps) => reviewWord({ ...scold, cards: { 𠮟: { ...scold.cards['𠮟'], reps } } }, '𠮟')?.w)).toContain('𠮟責')
})

it('asks only the kinds of question left on: new, a card by itself, a card through a word', () => {
  // 本 known for days and 日 just learned, both asked long ago: 本 has a word (日本), 日 is asked by itself
  const DAY = 86_400_000, now = 30 * DAY
  const base = learn(learn(blank, '本', 0), '日', 0)
  const s: Store = { ...base, cards: { ...base.cards, 本: { ...base.cards['本'], m: { s: 3, t: 0 }, r: { s: 3, t: 0 }, reps: 3 } } }
  const off = (...off: Store['off'] & {}) => ask({ ...s, off }, now)
  expect(off()?.kind).not.toBe('new')  // both long forgotten: a card before anything new
  expect(off('new', 'review')).toEqual({ el: '本', kind: 'words' })
  expect(off('new', 'words')?.kind).toBe('review')
  expect(off('review', 'words')?.kind).toBe('new')
  expect(off('new', 'review', 'words')).toBeUndefined()
  // without words 本 is still asked, by itself; without review 日, which has no word yet, is not
  expect(ask({ ...s, cards: { 本: s.cards['本'] }, off: ['new', 'words'] }, now)).toEqual({ el: '本', kind: 'review' })
  expect(ask({ ...s, cards: { 日: s.cards['日'] }, off: ['new', 'review'] }, now)).toBeUndefined()
  // nothing seen yet: only something new can be asked
  expect(ask({ ...blank, off: ['new'] }, now)).toBeUndefined()
  expect(ask(blank, now)?.kind).toBe('new')
})
