/** The learner's own mnemonics, one per kanji or part, as typed on its card. Kept in this browser beside the progress and
 * exported and imported with it, but not forgotten with it: a reset is of what was learned, not of what was written. */
const KEY = 'kanly/notes'

let all: Record<string, string> | null = null
export function notes(): Record<string, string> {
  if (!all) try { all = JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { all = {} }
  return all!
}

/** Replace them all (an import). */
export function setNotes(n: Record<string, string>) {
  all = n
  try { localStorage.setItem(KEY, JSON.stringify(n)) } catch {}
}

/** An emptied note is no note. */
export function setNote(el: string, text: string) {
  const { [el]: _, ...rest } = notes()
  setNotes(text.trim() ? { ...rest, [el]: text } : rest)
}
