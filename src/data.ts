import raw from './data/kanji.json'

export type Tree = { el: string; strokes: number; phon?: string; radical?: string; kids: Tree[] }
/** A word as written for the card (data/llm): reading is which of the kanji's readings it uses, or 'special'. */
export type Word = { w: string; r: string; g: string; lit?: string; special?: boolean; reading: string; furigana: [string, string][]; f: number }
export type Reading = { r: string; share: number }
export type Kanji = {
  keyword: string
  also: string[]
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
