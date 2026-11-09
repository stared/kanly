import { useEffect, useState } from 'react'
import { load, save, type Store } from './srs'
import { Card, TipLayer } from './Card'
import { Learn } from './Learn'
import { BEGINNER, mu, reach } from './levels'
import { Review, dueIds } from './Review'
import { Browse } from './Browse'
import { Reader } from './Reader'
import { Analysis } from './Analysis'
import { Settings } from './Settings'
import { track } from './track'
import { loadAutoSpeak, saveAutoSpeak } from './speech'

type Tab = 'learn' | 'review' | 'kanji' | 'reader' | 'analysis' | 'settings' | 'card'
const TABS: Tab[] = ['learn', 'review', 'kanji', 'reader', 'analysis']

export default function App() {
  const [store, setStore] = useState<Store>(load)
  const fromHash = () => (location.hash.slice(1).split('/')[0] as Tab) || 'learn'
  const [tab, setTab] = useState<Tab>(fromHash)
  useEffect(() => { track('tab', { tab }) }, [tab])
  const [hash, setHash] = useState(location.hash)
  const [peek, setPeek] = useState<string[]>([])
  const [now, setNow] = useState(Date.now())
  const [autoSpeak, setAutoSpeak] = useState(loadAutoSpeak)
  useEffect(() => saveAutoSpeak(autoSpeak), [autoSpeak])
  useEffect(() => save(store), [store])
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

  const open = (el: string) => { track('open', { el }); setPeek(p => p[p.length - 1] === el ? p : [...p, el]) }
  const due = dueIds(store, now).length

  return (
    <div className="app">
      <header>
        <span className="logo">漢</span>
        <nav>
          {TABS.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}{t === 'review' && due > 0 && <span className="count">{due}</span>}</button>)}
        </nav>
        {(Object.keys(store.cards).length > 0 || mu(store) > BEGINNER) && <span className="reach">you read {Math.round(reach(store) * 100)}% of text</span>}
        <button className={'gear' + (tab === 'settings' ? ' on' : '')} onClick={() => setTab('settings')} aria-label="settings">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
        </button>
        <a className="gear source" href="https://github.com/stared/kanly" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg><span>source code</span>
        </a>
      </header>
      <main>
        {tab === 'learn' && <Learn store={store} setStore={setStore} open={open} now={now} autoSpeak={autoSpeak} />}
        {tab === 'review' && <Review store={store} setStore={setStore} open={open} now={now} autoSpeak={autoSpeak} />}
        {tab === 'kanji' && <Browse store={store} open={open} />}
        {tab === 'reader' && <Reader store={store} open={open} />}
        {tab === 'analysis' && <Analysis store={store} />}
        {tab === 'card' && <Card key={hash} el={decodeURIComponent(hash.split('/')[1] ?? '日')} store={store} open={open} autoSpeak={autoSpeak} />}
        {tab === 'settings' && <Settings store={store} onReplace={setStore} autoSpeak={autoSpeak} setAutoSpeak={setAutoSpeak} />}
      </main>
      <TipLayer />
      {peek.length > 0 && (
        <div className="peek-bg" onClick={() => setPeek([])}>
          <aside className="peek" onClick={e => e.stopPropagation()}>
            <div className="peek-bar">
              <button disabled={peek.length < 2} onClick={() => setPeek(p => p.slice(0, -1))}>← back</button>
              <span className="trail">{peek.join(' › ')}</span>
              <button onClick={() => setPeek([])}>close</button>
            </div>
            <Card key={peek[peek.length - 1]} el={peek[peek.length - 1]} store={store} open={open} autoSpeak={autoSpeak} />
          </aside>
        </div>
      )}
    </div>
  )
}
