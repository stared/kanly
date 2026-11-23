import raw from './data/kanji.json'

/** pos: where the part sits in the element it is a direct part of: a side (left, right, top, bottom, middle), a frame named by
 * its ideographic description character (⿴ all around, ⿵ open below, ⿶ open above, ⿷ open right, ⿸ top and left, ⿹ top and right,
 * ⿺ left and bottom), inside such a frame, ⿻ merged into one shape, or split by a middle part (sides, ends); see build_data.py. */
export type Tree = { el: string; strokes: number; phon?: string; radical?: string; pos?: string; kids: Tree[] }
/** A word as written for the card (data/llm): reading is which of the kanji's readings it uses, or 'special'. */
/** senses: what each kanji of the word means in it, in order (本 in 日本: origin). */
export type Word = { w: string; r: string; g: string; lit?: string; special?: boolean; reading: string; furigana: [string, string][]; f: number; senses?: string[] }
export type Reading = { r: string; share: number }
export type Kanji = {
  keyword: string
  also: string[]
  /** main meanings in the order a reader meets them; alone false: only inside words, shown in parentheses */
  means?: [string, boolean][]
  readings: Reading[]
  alone: { r: string; g: string; reading: string } | null
  words: Word[]
  nshown: number
  written?: boolean
  kind?: 'origin' | 'memory'
  story?: string
  grade: number
  /** difficulty rank: 0 is the kanji learners know first */
  level: number
  /** rank by how often it is written: 0 is the most frequent */
  flevel: number
  kanken: number
  /** uses per million words of the common words written with it */
  use: number
  strokes: number
  on: string[]
  kun: string[]
  meanings: string[]
  freq: number
  sum: string[]
  tree: Tree
}
export type Component = {
  meaning?: string
  note?: string
  original?: string
  kind?: 'origin' | 'memory'
  story?: string
  on?: string[]
  kun?: string[]
  joyo: boolean
  usedIn: string[]
}
export type Family = { phonetic: string; reading: string; hits: string[]; misses: string[] }

type Data = {
  kanji: Record<string, Kanji>
  components: Record<string, Component>
  order: string[]
  families: Family[]
  curves: Record<string, number[]>
  /** weights of the difficulty fit, in decades of frequency; official lists as Fermi edges in the difficulty rank */
  levels: { weights: Record<string, number>; official: { name: string; n: number; mu: number; T: number }[] }
}

export const D = raw as unknown as Data
export const KANJI = D.kanji
export const COMP = D.components
export const ORDER = D.order
export const POS = new Map(ORDER.map((el, i) => [el, i]))

export const isKanji = (el: string) => el in KANJI

/** Short name of anything in a tree: the keyword of a kanji, else the component's name. */
export const gloss = (el: string) => KANJI[el]?.keyword ?? COMP[el]?.meaning ?? '?'

/** The sound family a kanji belongs to through a part KanjiVG marks as phonetic, if the hint holds at least half the time. */
export function soundFamily(ch: string): Family | undefined {
  const walk = (t: Tree): Family | undefined => {
    if (t.phon && t.el !== ch) return D.families.find(f => f.phonetic === t.el && f.hits.length >= 2 && f.hits.length >= f.misses.length)
    for (const k of t.kids) { const f = walk(k); if (f) return f }
  }
  return KANJI[ch] && walk(KANJI[ch].tree)
}

/** Strokes of a node not covered by its listed parts: 本 = 木 + 1 stroke. */
export const extraStrokes = (t: Tree) => t.kids.length ? Math.max(0, t.strokes - t.kids.reduce((a, k) => a + k.strokes, 0)) : 0

/** Every element of a tree, each once. */
export function elements(t: Tree, out = new Set<string>()): Set<string> {
  out.add(t.el)
  t.kids.forEach(k => elements(k, out))
  return out
}

export const hira = (s: string) => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
export const kata = (s: string) => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))

/** Kanji with the same parts but one: 待 持 特 時 all have 寺 and differ in the other part. */
const byPattern = new Map<string, string[]>()
for (const [ch, k] of Object.entries(KANJI)) {
  if (k.sum.length < 2) continue
  k.sum.forEach((_, i) => {
    const key = k.sum.map((p, j) => j === i ? '*' : p).join('+')
    byPattern.set(key, [...(byPattern.get(key) ?? []), ch])
  })
}
export function lookalikes(ch: string): { ch: string; mine: string; theirs: string }[] {
  const k = KANJI[ch]
  if (!k || k.sum.length < 2) return []
  return k.sum.flatMap((mine, i) => {
    const key = k.sum.map((p, j) => j === i ? '*' : p).join('+')
    // they look alike only if what they share is most of both: 待 and 持 share 寺 (6 of 9 strokes), 照 and 点 only 灬
    const shared = (c: string) => KANJI[c].tree.kids.reduce((a, t, j) => a + (j === i ? 0 : t.strokes), 0) / KANJI[c].strokes
    return (byPattern.get(key) ?? []).filter(o => o !== ch && KANJI[o].sum.length === k.sum.length && shared(ch) >= 0.5 && shared(o) >= 0.5)
      .map(o => ({ ch: o, mine, theirs: KANJI[o].sum[i] }))
  }).sort((a, b) => KANJI[b.ch].freq - KANJI[a.ch].freq)
}

/** Popularity among jōyō kanji: 1 is the most common in text. */
export const RANK = new Map(Object.entries(KANJI).sort((a, b) => b[1].freq - a[1].freq).map(([ch], i) => [ch, i + 1]))

const ROMA: Record<string, string> = Object.fromEntries((
  'あa いi うu えe おo かka きki くku けke こko さsa しshi すsu せse そso たta ちchi つtsu てte とto なna にni ぬnu ねne のno ' +
  'はha ひhi ふfu へhe ほho まma みmi むmu めme もmo やya ゆyu よyo らra りri るru れre ろro わwa ゐi ゑe をo んn ' +
  'がga ぎgi ぐgu げge ごgo ざza じji ずzu ぜze ぞzo だda ぢji づzu でde どdo ばba びbi ぶbu べbe ぼbo ぱpa ぴpi ぷpu ぺpe ぽpo ' +
  'ぁa ぃi ぅu ぇe ぉo ゔvu'
).split(' ').map(p => [p[0], p.slice(1)]))
const YOON: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' }

/** A reading in Hepburn romaji: ジン jin, ちが.う chigau, ガッ gakko; an on-reading's long vowels with macrons (コウ kō). */
export function romaji(r: string, on = /^[ァ-ヶー]+$/.test(r)): string {
  const s = hira(r.replace(/[.\-]/g, ''))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i], next = s[i + 1]
    if (c === 'っ') { const n = romaji(s.slice(i + 1, i + 3), false); out += n.startsWith('ch') ? 't' : n[0] ?? ''; continue }
    if (c === 'ー') { out += out.at(-1) ?? ''; continue }
    if (next && YOON[next]) {
      const base = ROMA[c] ?? c
      out += (/^(shi|chi|ji)$/.test(base) ? base.slice(0, -1) : base.slice(0, -1) + 'y') + YOON[next]
      i++; continue
    }
    out += c === 'ん' && next && /^[aiueoy]/.test(ROMA[next] ?? '') ? "n'" : ROMA[c] ?? c
  }
  return on ? out.replace(/ou|oo/g, 'ō').replace(/uu/g, 'ū') : out
}

/** Other ways to type a kana than Hepburn's: kunrei (si, ti, tu, hu, zi), a keyboard's (wo, du, nn). */
const TYPED: Record<string, string[]> = { し: ['si'], ち: ['ti'], つ: ['tu'], ふ: ['hu'], じ: ['zi'], ぢ: ['di', 'zi'], づ: ['du', 'dzu'], を: ['wo'], ん: ["n'", 'nn'] }
const LONG: Record<string, string[]> = { a: ['aa'], i: ['ii'], u: ['uu'], e: ['ee', 'ei'], o: ['ou', 'oo'] }
/** A long vowel under a macron, or a circumflex as some write it. */
const MACRON: Record<string, string[]> = Object.fromEntries([...'āīūēō'].map((c, n) => [c, LONG['aiueo'[n]]]).concat([...'âîûêô'].map((c, n) => [c, LONG['aiueo'[n]]])))

/** The ways to type the kana that k starts with, each with the number of kana it covers; before: the kana ahead of it. */
function spellings(k: string, before: string): [string, number][] {
  const c = k[0], y = YOON[k[1]]
  const own = ROMA[c] ? [ROMA[c], ...(TYPED[c] ?? [])] : []
  if (c === 'ー') return [[romaji(before, false).at(-1) ?? '', 1]]
  if (c === 'っ') {
    // the next consonant doubled; before ch also t (matcha)
    return spellings(k.slice(1), '').filter(([s]) => /^[^aiueon]/.test(s))
      .flatMap(([s, n]): [string, number][] => [[s[0] + s, n + 1], ...(s.startsWith('ch') ? [['t' + s, n + 1] as [string, number]] : [])])
  }
  if (y) return own.filter(s => s.endsWith('i')).flatMap((s): [string, number][] => {
    const stem = s.slice(0, -1)  // sh + a, k + y + a
    return /^(sh|ch|j)$/.test(stem) ? [[stem + y, 2], ...(stem === 'j' ? [['jy' + y, 2] as [string, number]] : [])] : [[stem + 'y' + y, 2]]
  })
  return own.map(s => [s, 1])
}

/** What was typed, made plain: full-width letters and half-width kana as usual ones, a typographic apostrophe as ', lower
 * case, katakana as hiragana, no spaces, dots or hyphens. The last one is kept: a search asks about 2,500 readings at once. */
let typedAs: [string, string] = ['', '']
function plainTyped(typed: string): string {
  if (typedAs[0] !== typed) typedAs = [typed, hira(typed.normalize('NFKC').toLowerCase().replace(/[’‘`]/g, "'")).replace(/[\s.\-]/g, '')]
  return typedAs[1]
}

/** Does what was typed spell this reading? Romaji as Hepburn writes it or as a keyboard takes it (shi or si, ja or zya,
 * ō or ou, a doubled consonant for っ; ん as n, nn or n', so that both onna and on'na are おんな and genin is げんいん
 * as well as げにん), or kana. Long vowels count: tokyo is not とうきょう. prefix: typed so far, the reading may go on. */
export function reads(typed: string, reading: string, prefix = false): boolean {
  const want = hira(reading.replace(/[.\-]/g, ''))
  const go = (s: string, i: number, j: number): boolean => {
    if (i === s.length) return prefix || j === want.length || want.slice(j) === 'っ'  // a reading cut short (ガッ), which romaji() writes as ga
    if (j === want.length) return false
    if (s[i] === want[j] && go(s, i + 1, j + 1)) return true  // typed in kana
    // a macron stands for two kana, and ō for either of ou and oo: spelled out when the match gets to its syllable
    // (not all of them up front: eight ō in a pasted line made 256 lines to try against every reading)
    const m = [...s.slice(i, i + 4)].findIndex(c => MACRON[c])
    if (m >= 0) return MACRON[s[i + m]].some(two => go(s.slice(0, i + m) + two + s.slice(i + m + 1), i, j))
    const rest = s.slice(i)
    return spellings(want.slice(j), want.slice(0, j)).some(([sp, n]) => rest.startsWith(sp) ? go(s, i + sp.length, j + n) : prefix && sp.startsWith(rest))
  }
  const s = plainTyped(typed)
  return !!s && go(s, 0, 0)
}
