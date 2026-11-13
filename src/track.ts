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

/** Also sent to PostHog, when the build has a key (VITE_POSTHOG_KEY: the deployed site, not forks nor local dev). */
const KEY_PH = import.meta.env.VITE_POSTHOG_KEY as string | undefined
type Capture = (e: string, data: Record<string, unknown>) => void
let send: Capture | null = null
const waiting: [string, Record<string, unknown>][] = []  // events before the library has loaded

export function startAnalytics() {
  if (!KEY_PH) return
  // loaded after the first paint, in its own chunk
  import('posthog-js').then(({ default: ph }) => {
    ph.init(KEY_PH, {
      api_host: 'https://eu.i.posthog.com',
      persistence: 'localStorage',  // no cookies
      autocapture: false,  // the app's own events say more than raw clicks
      disable_session_recording: true,
      disable_surveys: true,
      capture_pageview: true,
    })
    send = (e, data) => ph.capture(e, data)
    waiting.splice(0).forEach(([e, d]) => send!(e, d))
  }).catch(() => {})
}

export const track = (e: string, data: Record<string, unknown> = {}) => {
  setEvents([...events(), { t: Date.now(), e, ...data }])
  if (KEY_PH) send ? send(e, data) : waiting.push([e, data])
}
