import type { Store } from './srs'

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
      <p>{Object.keys(store.cards).length} items learned, {store.log.length} reviews. Progress is stored in this browser only.</p>
      <div className="row">
        <button className="next" onClick={exportIt}>export progress</button>
        <label className="next">import<input type="file" accept="application/json" hidden onChange={e => importIt(e.target.files?.[0])} /></label>
        <button className="next bad" onClick={() => confirm('Forget all progress?') && onReplace({ cards: {}, log: [] })}>reset</button>
      </div>
    </div>
  )
}
