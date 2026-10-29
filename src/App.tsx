import { useEffect, useState } from 'react'
import { load, save, type Store } from './srs'
import { Card, TipLayer } from './Card'
import { Learn, coverage } from './Learn'
import { Review, dueIds } from './Review'
import { Browse } from './Browse'
import { Reader } from './Reader'
import { Analysis } from './Analysis'
import { Settings } from './Settings'
import { loadAutoSpeak, saveAutoSpeak } from './speech'

type Tab = 'learn' | 'review' | 'kanji' | 'reader' | 'analysis' | 'settings' | 'card'
const TABS: Tab[] = ['learn', 'review', 'kanji', 'reader', 'analysis']

export default function App() {
  const [store, setStore] = useState<Store>(load)
  const fromHash = () => (location.hash.slice(1).split('/')[0] as Tab) || 'learn'
  const [tab, setTab] = useState<Tab>(fromHash)
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

  const open = (el: string) => setPeek(p => p[p.length - 1] === el ? p : [...p, el])
  const due = dueIds(store, now).length

  return (
    <div className="app">
      <header>
        <span className="logo">漢</span>
        <nav>
          {TABS.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}{t === 'review' && due > 0 && <span className="count">{due}</span>}</button>)}
        </nav>
        {Object.keys(store.cards).length > 0 && <span className="reach" title={`${Object.keys(store.cards).length} items learned; share of kanji in Japanese Wikipedia text`}>you read {Math.round(coverage(Object.keys(store.cards)) * 100)}% of text</span>}
        <button className={'gear' + (tab === 'settings' ? ' on' : '')} onClick={() => setTab('settings')} aria-label="settings" title="settings">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
        </button>
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
