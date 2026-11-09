/** What happens while learning, kept in this browser for later analysis (exported with progress):
 * quiz answers with what was offered, what was picked and how long it took, and light UI events. */
export type Ev = { t: number; e: string; [k: string]: unknown }

const KEY = 'kanly/events'
const MAX = 50_000  // the oldest go first; a few MB at most

let all: Ev[] | null = null
export function events(): Ev[] {
  if (!all) try { all = JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { all = [] }
  return all!
}

export function setEvents(evs: Ev[]) {
  all = evs.slice(-MAX)
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch {}
}

export const track = (e: string, data: Record<string, unknown> = {}) => setEvents([...events(), { t: Date.now(), e, ...data }])
