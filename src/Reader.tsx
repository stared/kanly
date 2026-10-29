import { useState } from 'react'
import { KANJI, gloss } from './data'
import { status, type Store } from './srs'

const SAMPLE = `日本は東アジアにある島国で、首都は東京です。人口は約一億二千万人で、多くの人が大きな都市に住んでいます。春には桜が咲き、秋には山の木の葉が赤や黄色に変わります。`

const isHan = (c: string) => /\p{Script=Han}/u.test(c)

export function Reader({ store, open }: { store: Store; open: (el: string) => void }) {
  const [text, setText] = useState(SAMPLE)
  const [editing, setEditing] = useState(false)
  const chars = [...text]
  const han = chars.filter(isHan)
  const distinct = [...new Set(han)]
  const read = (c: string) => status(store, c) !== 'new'
  const known = han.filter(read).length
  const unknown = distinct.filter(c => !read(c) && KANJI[c]).sort((a, b) => han.filter(x => x === b).length - han.filter(x => x === a).length)

  return (
    <div className="reader">
      {editing && <textarea autoFocus value={text} onChange={e => setText(e.target.value)} onBlur={() => setEditing(false)} rows={5} placeholder="Paste Japanese text" />}
      <div className="bar-line sub small">
        <span>You know {known} of {han.length} kanji here ({han.length ? Math.round(100 * known / han.length) : 0}%){distinct.some(c => !KANJI[c]) && <>; not jōyō: {distinct.filter(c => !KANJI[c]).join('')}</>}.</span>
        {!editing && <button className="inline" onClick={() => setEditing(true)}>edit text</button>}
      </div>
      <div className="text">
        {chars.map((c, i) => isHan(c) && KANJI[c]
          ? <button key={i} className={'k ' + status(store, c)} onClick={() => open(c)} title={gloss(c)}>{c}</button>
          : <span key={i} className={isHan(c) ? 'k rare' : ''}>{c}</span>)}
      </div>
      {unknown.length > 0 && (
        <div className="used">
          <h3>New to you, most frequent here first</h3>
          <div className="chips">{unknown.map(c => <button key={c} className="chip" onClick={() => open(c)} title={gloss(c)}>{c}</button>)}</div>
        </div>
      )}
    </div>
  )
}
