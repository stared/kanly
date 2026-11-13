import type { Store } from './srs'
import { events, setEvents } from './track'
import { useState } from 'react'
import { applyTheme, loadTheme, type Theme } from './theme'
import { BEGINNER, BREADTH, LEVELS, T, mu, startAt, temp } from './levels'

const r10 = (x: number) => Math.max(0, Math.round(x / 10) * 10)
/** p = 0.9 and 0.1 lie 1.28 T either side of μ. */
const fit = (s: Store) => (s.answers?.length ?? 0) < 10
  ? `You knew about ${r10(mu(s))} kanji before.`
  : `From your answers: you knew about ${r10(mu(s))} kanji before, nearly all of the ${r10(mu(s) - 1.28 * temp(s))} easiest and few beyond the ${r10(mu(s) + 1.28 * temp(s))}th.`

export function Settings({ store, onReplace, autoSpeak, setAutoSpeak }: { store: Store; onReplace: (s: Store) => void; autoSpeak: boolean; setAutoSpeak: (on: boolean) => void }) {
  const exportIt = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...store, events: events() })], { type: 'application/json' }))
    a.download = `kanly-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  const importIt = (f?: File) => f?.text().then(t => {
    const { events: evs, ...s } = JSON.parse(t)
    if (s?.cards && s?.log) { onReplace(s); if (evs) setEvents(evs) }
  })
  const [theme, setTheme] = useState<Theme>(loadTheme)
  return (
    <div className="settings">
      <label className="field">Colours
        <select value={theme} onChange={e => { const t = e.target.value as Theme; setTheme(t); applyTheme(t) }}>
          <option value="system">as the system</option>
          <option value="light">light</option>
          <option value="dark">dark</option>
        </select>
      </label>
      <label className="toggle"><input type="checkbox" checked={autoSpeak} onChange={e => setAutoSpeak(e.target.checked)} /> read each new kanji aloud (browser's Japanese voice)</label>
      <label className="field">Start from
        <select value={store.start && LEVELS.findIndex(l => l.mu === store.start?.mu) < 0 ? -1 : Math.max(0, LEVELS.findIndex(l => l.mu === store.start?.mu))} onChange={e => onReplace(startAt(store, LEVELS[+e.target.value]))}>
          {LEVELS.map((l, i) => <option key={l.label} value={i}>{l.label}</option>)}
          {LEVELS.findIndex(l => l.mu === store.start?.mu) < 0 && store.start && <option value={-1} disabled>your own guess</option>}
        </select>
        or about
        <input className="num" type="number" min={0} max={2136} step={50} placeholder="1200"
          onKeyDown={e => { if (e.key === 'Enter') onReplace(startAt(store, { mu: +e.currentTarget.value, T })) }}
          onBlur={e => e.currentTarget.value && onReplace(startAt(store, { mu: +e.currentTarget.value, T }))} /> kanji
      </label>
      <label className="field">Next kanji
        <select value={store.tau ?? 0} onChange={e => onReplace({ ...store, tau: +e.target.value })}>
          {BREADTH.map(b => <option key={b.tau} value={b.tau}>{b.label}</option>)}
        </select>
      </label>
      {mu(store) > BEGINNER && <p>{fit(store)} Every quiz answer refines this.</p>}
      <p><a href="#kanji/seen">{Object.keys(store.cards).length} kanji and parts seen</a>, {store.log.length} reviews, {events().length} answers and clicks logged. Progress is stored in this browser only; export saves all of it as one file.</p>
      <div className="row">
        <button className="next" onClick={exportIt}>export progress</button>
        <label className="next">import<input type="file" accept="application/json" hidden onChange={e => importIt(e.target.files?.[0])} /></label>
        <button className="next bad" onClick={() => { if (confirm('Forget all progress?')) { onReplace({ cards: {}, log: [] }); setEvents([]) } }}>reset</button>
      </div>
    </div>
  )
}
