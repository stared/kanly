import { useEffect, useState } from 'react'
import { load, save, type Store } from './srs'
import { Card } from './Card'
import { Learn } from './Learn'
import { Review, dueIds } from './Review'
import { Browse } from './Browse'
import { Reader } from './Reader'
import { Analysis } from './Analysis'
import { Settings } from './Settings'

type Tab = 'learn' | 'review' | 'kanji' | 'reader' | 'analysis' | 'settings'
const TABS: Tab[] = ['learn', 'review', 'kanji', 'reader', 'analysis']

export default function App() {
  const [store, setStore] = useState<Store>(load)
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'learn')
  const [peek, setPeek] = useState<string[]>([])
  const [now, setNow] = useState(Date.now())
  useEffect(() => save(store), [store])
  useEffect(() => { history.replaceState(null, '', '#' + tab) }, [tab])
  useEffect(() => {
    const h = () => setTab((location.hash.slice(1) as Tab) || 'learn')
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
        <button className={'gear' + (tab === 'settings' ? ' on' : '')} onClick={() => setTab('settings')}>settings</button>
      </header>
      <main>
        {tab === 'learn' && <Learn store={store} setStore={setStore} open={open} now={now} />}
        {tab === 'review' && <Review store={store} setStore={setStore} open={open} now={now} />}
        {tab === 'kanji' && <Browse store={store} open={open} />}
        {tab === 'reader' && <Reader store={store} open={open} />}
        {tab === 'analysis' && <Analysis store={store} />}
        {tab === 'settings' && <Settings store={store} onReplace={setStore} />}
      </main>
      {peek.length > 0 && (
        <div className="peek-bg" onClick={() => setPeek([])}>
          <aside className="peek" onClick={e => e.stopPropagation()}>
            <div className="peek-bar">
              <button disabled={peek.length < 2} onClick={() => setPeek(p => p.slice(0, -1))}>← back</button>
              <span className="trail">{peek.join(' › ')}</span>
              <button onClick={() => setPeek([])}>close</button>
            </div>
            <Card key={peek[peek.length - 1]} el={peek[peek.length - 1]} store={store} open={open} />
          </aside>
        </div>
      )}
    </div>
  )
}
