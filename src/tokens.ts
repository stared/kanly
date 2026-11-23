/** A text cut into the words of the word list, for the reader. */
export type Entry = [string, string, string]  // word, reading, gloss
export type Token = { text: string; entry?: Entry }

export const isHan = (c: string) => /\p{Script=Han}/u.test(c) || c === '々'
const isKana = (c: string) => /[ぁ-ゖ]/.test(c)

/** Index of common words; one ending in kana (住む, 住まい) is also kept under its stem (住), to find 住んで. */
export function index(words: Entry[]) {
  const exact = new Map<string, Entry>()
  const stems = new Map<string, Entry[]>()
  for (const e of words) {
    exact.set(e[0], e)
    const stem = e[0].replace(/[ぁ-ゖ]+$/, '')
    if (stem !== e[0] && stem) stems.set(stem, [...(stems.get(stem) ?? []), e])
  }
  return { exact, stems }
}

/** What the last kana of a verb turns into: its a, i, e, o forms and the one before て and た (住む: 住ま 住み 住め 住も 住ん). */
const FORMS: Record<string, string> = { う: 'わいえおっ', く: 'かきけこい', ぐ: 'がぎげごい', す: 'さしせそ', つ: 'たちてとっ', ぬ: 'なにねのん', ぶ: 'ばびべぼん', む: 'まみめもん', る: 'らりれろっ' }
const I_E = 'いきぎしじちぢにひびぴみりえけげせぜてでねへべぺめれ'

/** How well a word of the stem accounts for the kana after it, as written or inflected; 0: not at all.
 * 住んで is 住む (む is ん before で), not 住まい; 見ます is 見る, not 見える; 行きます is 行く, 行きの is 行き. */
export function fit(ending: string, next: string): number {
  if (next.startsWith(ending)) return ending.length
  const head = ending.slice(0, -1), last = ending.at(-1)!
  if (!next.startsWith(head)) return 0
  const after = next[head.length] ?? ''
  const verb = (n: number) => n + ('またてな'.includes(next[n] ?? '-') ? 0.5 : 0)  // ます, た, て, ない after it: a verb, not a noun
  if (last === 'い') return after && 'くかけさ'.includes(after) ? head.length + 1 : 0  // 大きく, 多かった, 高ければ, 高さ
  if (last === 'る' && head && I_E.includes(head.at(-1)!)) return verb(head.length) + 0.5  // 食べる: 食べ, then anything
  if (after && FORMS[last]?.includes(after)) return verb(head.length + 1)
  if (last === 'る' && !head && after && 'てたまなよれらず'.includes(after)) return 0.5  // 見る: 見て, 見ます, 見ない
  return 0
}

/** From left to right, at each kanji the word that accounts for the most of what follows: as written (東京, 変わり),
 * or by its stem with the kana after it as one of its forms (住んで is 住む, not the bare 住 じゅう; 変わります is
 * 変わる, a kana further than the noun 変わり). As written wins a tie. Text without kanji passes through as is. */
export function tokenize(text: string, ix: ReturnType<typeof index>): Token[] {
  const out: Token[] = []
  const chars = [...text]
  for (let i = 0; i < chars.length;) {
    if (!isHan(chars[i])) {
      const last = out[out.length - 1]
      if (last && !last.entry && !isHan(last.text[0])) last.text += chars[i]
      else out.push({ text: chars[i] })
      i++
      continue
    }
    let hit: Token = { text: chars[i] }, top = 0
    for (let n = Math.min(8, chars.length - i); n > 0; n--) {
      const s = chars.slice(i, i + n).join('')
      const exact = ix.exact.get(s)
      if (exact && n > top) { top = n; hit = { text: s, entry: exact } }
      const next = chars.slice(i + n, i + n + 6).join('')
      if (isKana(next[0] ?? '')) for (const e of ix.stems.get(s) ?? []) {
        const f = fit(e[0].slice(s.length), next)
        if (f > 0 && n + f > top) { top = n + f; hit = { text: s, entry: e } }
      }
    }
    out.push(hit)
    i += [...hit.text].length
  }
  return out
}
