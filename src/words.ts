import { KANJI, reads, type Word } from './data'
import { standing } from './levels'
import type { Store } from './srs'

/*
A kanji whose memory has reached a day (srs.ts) is asked again through a word: the word is shown, its reading and
its meaning are typed. Recognising 語 among four meanings is easy long after 日本語 can no longer be read; the word
is what a reader meets. A kanji with a shorter memory, just learned or just missed, is asked by itself, as when it
was learned. The answer moves the kanji's own card, so words add no cards: they are the form its question takes.
*/
const isHan = (c: string) => /\p{Script=Han}/u.test(c) || c === '々'  // 𠮟 too, outside the usual block

/** The word to review a kanji by: one of its card's words written in kanji alone, two or more (日本, 先生, 今日), all of
 * them seen or assumed known; in the card's order of use, a different one each review. None: the kanji is asked by itself. */
export function reviewWord(s: Store, id: string): Word | undefined {
  const k = KANJI[id], c = s.cards[id]
  if (!k || !c || c.s < 1) return
  const fit = k.words.filter((w, i) => [...w.w].length >= 2 && [...w.w].every(ch => isHan(ch) && (ch === id || ch === '々' || standing(s, ch) !== 'new'))
    && k.words.findIndex(x => x.w === w.w) === i)  // a word with two readings (紅葉 こうよう, もみじ) once
  return fit.length ? fit[c.reps % fit.length] : undefined
}

/** The card's entries for a word as written: more than one when it has two readings, and either is right. */
export const entries = (id: string, w: Word) => KANJI[id].words.filter(x => x.w === w.w)

/** The entry whose reading was typed, in kana or romaji (see reads in data.ts). */
export const readAs = (typed: string, ws: Word[]) => ws.find(w => reads(typed, w.r))

/** The glosses of a word on the cards of all its kanji: they differ a little from card to card (休日 is a holiday on one,
 * a day off on another), and each is its meaning. */
export const glosses = (w: Word) => [...new Set([...w.w].flatMap(c => KANJI[c]?.words.filter(x => x.w === w.w && x.r === w.r).map(x => x.g) ?? []))]

/** Plain letters: no accents (café), no case, no punctuation, 10,000 as 10000, no leading to, a, an, the. */
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/(\d),(?=\d{3})/g, '$1')
  .replace(/[^a-z0-9']+/g, ' ').trim().replace(/^(to|a|an|the) (?=\S)/, '')

/** What a gloss lets pass for its meaning: each alternative (split at ;, not at commas: "food, clothing and shelter" is
 * one meaning), with what is in brackets and without it: "(one's) life" is life or one's life, "truth; real" truth or real. */
export function accepted(gloss: string): string[] {
  return [...new Set(gloss.split(';').flatMap(a => [a.replace(/\([^)]*\)/g, ' '), a.replace(/[()]/g, ' ')]).map(plain).filter(Boolean))]
}

/** Slips of the keyboard between a and b: a letter changed, added or dropped, or two neighbours swapped (recieve). */
function distance(a: string, b: string): number {
  let before: number[] = [], row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) next[j] = Math.min(next[j], before[j - 2] + 1)
    }
    before = row
    row = next
  }
  return row[b.length]
}

/** The same but for typos, word by word: a slip in a word of 5 letters or more, two in 10 or more, the first letter
 * right. Per word and not across the phrase, or possible would pass for impossible, and male for female. */
const same = (a: string, t: string) => {
  const x = a.split(' '), y = t.split(' ')
  return x.length === y.length && x.every((w, i) => w === y[i] || (w[0] === y[i][0] && distance(w, y[i]) <= (w.length >= 10 ? 2 : w.length >= 5 ? 1 : 0)))
}

/** Is the typed meaning one the glosses give? The whole of it, or each of several typed (truth, real), none of them wrong.
 * A synonym no gloss lists is not found, so the review lets the learner overrule a "wrong" meaning. */
export function meant(typed: string, ...of: string[]): boolean {
  const ok = of.flatMap(accepted)
  const is = (t: string) => !!t && ok.some(a => same(a, t))
  const each = typed.split(/[;,/]/).map(plain).filter(Boolean)
  return is(plain(typed)) || (each.length > 1 && each.every(is))
}
