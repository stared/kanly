import type { Store } from './srs'
import { BEGINNER, BREADTH, LEVELS, mu, startAt, temp } from './levels'

const r10 = (x: number) => Math.max(0, Math.round(x / 10) * 10)
/** p = 0.9 and 0.1 lie 1.28 T either side of μ. */
const fit = (s: Store) => (s.answers?.length ?? 0) < 10
  ? `You knew about ${r10(mu(s))} kanji before.`
  : `From your answers: you knew about ${r10(mu(s))} kanji before, nearly all of the ${r10(mu(s) - 1.28 * temp(s))} easiest and few beyond the ${r10(mu(s) + 1.28 * temp(s))}th.`

export function Settings({ store, onReplace, autoSpeak, setAutoSpeak }: { store: Store; onReplace: (s: Store) => void; autoSpeak: boolean; setAutoSpeak: (on: boolean) => void }) {
  const exportIt = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(store)], { type: 'application/json' }))
    a.download = `kanly-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  const importIt = (f?: File) => f?.text().then(t => {
    const s = JSON.parse(t)
    if (s?.cards && s?.log) onReplace(s)
  })
  return (
    <div className="settings">
      <label className="toggle"><input type="checkbox" checked={autoSpeak} onChange={e => setAutoSpeak(e.target.checked)} /> read each new kanji aloud (browser's Japanese voice)</label>
      <label className="field">Start from
        <select value={Math.max(0, LEVELS.findIndex(l => l.mu === store.start?.mu))} onChange={e => onReplace(startAt(store, LEVELS[+e.target.value]))}>
          {LEVELS.map((l, i) => <option key={l.label} value={i}>{l.label}</option>)}
        </select>
      </label>
      <label className="field">Next kanji
        <select value={store.tau ?? 0} onChange={e => onReplace({ ...store, tau: +e.target.value })}>
          {BREADTH.map(b => <option key={b.tau} value={b.tau}>{b.label}</option>)}
        </select>
      </label>
      {mu(store) > BEGINNER && <p>{fit(store)} Every “I know it” and “new to me” refines this.</p>}
      <p>{Object.keys(store.cards).length} items learned, {store.log.length} reviews. Progress is stored in this browser only.</p>
      <div className="row">
        <button className="next" onClick={exportIt}>export progress</button>
        <label className="next">import<input type="file" accept="application/json" hidden onChange={e => importIt(e.target.files?.[0])} /></label>
        <button className="next bad" onClick={() => confirm('Forget all progress?') && onReplace({ cards: {}, log: [] })}>reset</button>
      </div>
    </div>
  )
}
