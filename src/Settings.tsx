import type { Store } from './srs'
import { BEGINNER, BREADTH, LEVELS, mu } from './levels'

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
        <select value={LEVELS.reduce((a, l) => Math.abs(l.mu - mu(store)) < Math.abs(a.mu - mu(store)) ? l : a).mu} onChange={e => onReplace({ ...store, mu: +e.target.value })}>
          {LEVELS.map(l => <option key={l.mu} value={l.mu}>{l.label}</option>)}
        </select>
      </label>
      <label className="field">Next kanji
        <select value={store.tau ?? 0} onChange={e => onReplace({ ...store, tau: +e.target.value })}>
          {BREADTH.map(b => <option key={b.tau} value={b.tau}>{b.label}</option>)}
        </select>
      </label>
      {mu(store) > BEGINNER && <p>From your answers, you knew about {Math.max(0, Math.round(mu(store) / 10) * 10)} kanji before. Every “I know it” and “new to me” moves this.</p>}
      <p>{Object.keys(store.cards).length} items learned, {store.log.length} reviews. Progress is stored in this browser only.</p>
      <div className="row">
        <button className="next" onClick={exportIt}>export progress</button>
        <label className="next">import<input type="file" accept="application/json" hidden onChange={e => importIt(e.target.files?.[0])} /></label>
        <button className="next bad" onClick={() => confirm('Forget all progress?') && onReplace({ cards: {}, log: [] })}>reset</button>
      </div>
    </div>
  )
}
