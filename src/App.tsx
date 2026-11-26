import { useEffect, useState } from 'react'
import { save, type Store } from './srs'
import { load } from './past'
import type { Word } from './data'
import { Card, TipLayer, hideTip } from './Card'
import { Learn } from './Learn'
import { BEGINNER, mu, reach } from './levels'
import { Browse } from './Browse'
import { Graph } from './Graph'
import { Reader } from './Reader'
import { About } from './About'
import { Settings } from './Settings'
import { track } from './track'
import { applyUpdate } from './update'
import { loadAutoSpeak, saveAutoSpeak } from './speech'

type Tab = 'learn' | 'kanji' | 'graph' | 'reader' | 'about' | 'settings' | 'card'
const TABS: Tab[] = ['learn', 'kanji', 'graph', 'reader', 'about']

export default function App() {
  const [store, setStore] = useState<Store>(load)
  // #analysis: the about tab's name until it was made to say what the app is; #review: a tab of its own until reviews joined the one stream
  const fromHash = () => (location.hash.slice(1).split('/')[0].replace(/^analysis$/, 'about').replace(/^review$/, 'learn') as Tab) || 'learn'
  const [tab, setTab] = useState<Tab>(fromHash)
  useEffect(() => { track('tab', { tab }); setPeek([]); applyUpdate() }, [tab])
  const [hash, setHash] = useState(location.hash)
  // the cards opened in the drawer, one from another, the last on show; word: the word a card was opened for (one
  // clicked in the reader), shown on top of it
  const [peek, setPeek] = useState<{ el: string; word?: Word }[]>([])
  const [now, setNow] = useState(Date.now())
  const [autoSpeak, setAutoSpeak] = useState(loadAutoSpeak)
  useEffect(() => saveAutoSpeak(autoSpeak), [autoSpeak])
  useEffect(() => { save(store); applyUpdate() }, [store])  // saved first: a new version may load now
  useEffect(() => { if (fromHash() !== tab) history.replaceState(null, '', '#' + tab) }, [tab])
  useEffect(() => {
    const h = () => { setTab(fromHash()); setHash(location.hash) }
    addEventListener('hashchange', h)
    return () => removeEventListener('hashchange', h)
  }, [])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPeek([]) }
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [])

  const open = (el: string, word?: Word) => { hideTip(); track('open', { el, ...(word && { word: word.w }) }); setPeek(p => p[p.length - 1]?.el === el ? p : [...p, { el, word }]) }

  const top = peek[peek.length - 1]
  const can = reach(store, now), pct = { meaning: Math.round(can.meaning * 100), reading: Math.round(can.reading * 100) }
  return (
    <div className="app">
      <header>
        <nav>
          {TABS.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
        </nav>
        <div className="end">
          {/* how much of the kanji in text is known: by meaning (an idea), by reading (a voice); in words under a mouse and for a screen reader */}
          {(Object.keys(store.cards).length > 0 || mu(store) > BEGINNER) && (
            <span className="reach" role="img" title={`Of the kanji in text you know the meaning of ${pct.meaning}% and the reading of ${pct.reading}%`} aria-label={`Of the kanji in text you know the meaning of ${pct.meaning}% and the reading of ${pct.reading}%`}>
              <span><svg viewBox="0 0 12 12" width="12" height="12"><path d="M4.3 8.3a3.6 3.6 0 1 1 3.4 0v1.2H4.3zM4.9 11.2h2.2" /></svg>{pct.meaning}%</span>
              <span><svg viewBox="0 0 12 12" width="12" height="12"><path d="M1.5 4.6h1.9l2.8-2.3v7.4L3.4 7.4H1.5zM8.4 4.2a2.6 2.6 0 0 1 0 3.6M10 2.8a4.6 4.6 0 0 1 0 6.4" /></svg>{pct.reading}%</span>
            </span>
          )}
          <button className={'gear' + (tab === 'settings' ? ' on' : '')} onClick={() => setTab('settings')} aria-label="settings">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">{/* six teeth about the centre of the box, where the hole is: tips at 8.3, 11.85° either side of each tooth's axis, roots at 5.95, 21.8° */}
              <path d="M9.79 6.48L10.3 3.88L13.7 3.88L14.21 6.48L15.68 7.32L18.18 6.46L19.89 9.41L17.89 11.15L17.89 12.85L19.89 14.59L18.18 17.54L15.68 16.68L14.21 17.52L13.7 20.12L10.3 20.12L9.79 17.52L8.32 16.68L5.82 17.54L4.11 14.59L6.11 12.85L6.11 11.15L4.11 9.41L5.82 6.46L8.32 7.32z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
          <a className="gear source" href="https://github.com/stared/kanly" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg><span>source code</span>
          </a>
        </div>
      </header>
      <main>
        {tab === 'learn' && <Learn store={store} setStore={setStore} open={open} autoSpeak={autoSpeak} />}
        {tab === 'kanji' && <Browse store={store} open={open} />}
        {tab === 'graph' && <Graph store={store} open={open} />}
        {tab === 'reader' && <Reader store={store} open={open} />}
        {tab === 'about' && <About store={store} open={open} />}
        {tab === 'card' && <Card key={hash} el={decodeURIComponent(hash.split('/')[1] ?? '日')} store={store} open={open} autoSpeak={autoSpeak} />}
        {tab === 'settings' && <Settings store={store} onReplace={setStore} autoSpeak={autoSpeak} setAutoSpeak={setAutoSpeak} />}
      </main>
      <TipLayer />
      {top && (
        <div className="peek-bg" onClick={() => setPeek([])}>
          <aside className="peek" onClick={e => e.stopPropagation()}>
            <div className="peek-bar">
              <button disabled={peek.length < 2} onClick={() => setPeek(p => p.slice(0, -1))}>← back</button>
              <span className="trail">{peek.map(p => p.el).join(' › ')}</span>
              <button onClick={() => setPeek([])}>close</button>
            </div>
            <Card key={top.el} el={top.el} word={top.word} store={store} open={open} autoSpeak={autoSpeak} />
          </aside>
        </div>
      )}
    </div>
  )
}
