import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { QuizItem } from './types'
import { auth, signInWithGoogle, signOut } from './lib/firebase'

function useQuestions() {
  const [items, setItems] = useState<QuizItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/questions.json')
      .then(r => r.json())
      .then(setItems)
      .catch(e => setError(String(e)))
  }, [])
  return { items, error }
}

function App() {
  const { items, error } = useQuestions()
  const [index, setIndex] = useState(0)
  const [show, setShow] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    if (!items) return [] as QuizItem[]
    const term = q.trim().toLowerCase()
    if (!term) return items
    return items.filter(it =>
      it.question.toLowerCase().includes(term) || it.answer.toLowerCase().includes(term)
    )
  }, [items, q])

  useEffect(() => {
    setIndex(0)
    setShow(false)
  }, [q])

  if (error) return <div style={{ padding: 24 }}>Failed to load: {error}</div>
  if (!items) return <div style={{ padding: 24 }}>Loading questions…</div>
  if (filtered.length === 0) return (
    <div style={{ padding: 24 }}>
      <Controls q={q} setQ={setQ} count={items.length} shown={filtered.length} />
      <p>No results.</p>
    </div>
  )

  const current = filtered[Math.max(0, Math.min(index, filtered.length - 1))]

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1>AWS SAA-C03 Quiz</h1>
      <AuthPanel />
      <Controls q={q} setQ={setQ} count={items.length} shown={filtered.length} />
      <nav style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button onClick={() => { setIndex(i => Math.max(0, i - 1)); setShow(false) }}>Prev</button>
        <button onClick={() => { setShow(s => !s) }}>{show ? 'Hide' : 'Show'} Answer</button>
        <button onClick={() => { setIndex(i => Math.min(filtered.length - 1, i + 1)); setShow(false) }}>Next</button>
        <span style={{ marginLeft: 'auto' }}>Question {index + 1} of {filtered.length} (id {current.id})</span>
      </nav>
      <section>
        <h3 style={{ marginTop: 8 }}>Question</h3>
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{current.question}</p>
      </section>
      {show && (
        <section style={{ marginTop: 16 }}>
          <h3>Answer</h3>
          <p style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 12, borderRadius: 8 }}>{current.answer}</p>
          {current.notes && (
            <details style={{ marginTop: 8 }}>
              <summary>Notes</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{current.notes}</pre>
            </details>
          )}
        </section>
      )}
      <section style={{ marginTop: 24 }}>
        <h3>Jump to</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 8 }}>
          {filtered.map((it, idx) => (
            <button key={it.id} onClick={() => { setIndex(idx); setShow(false) }} style={{ padding: '6px 8px' }}>{it.id}</button>
          ))}
        </div>
      </section>
    </div>
  )
}

function Controls({ q, setQ, count, shown }: { q: string; setQ: (s: string) => void; count: number; shown: number }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '8px 0' }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search in questions/answers"
        style={{ flex: 1, padding: 8 }}
      />
      <span style={{ opacity: 0.7 }}>{shown} of {count}</span>
    </div>
  )
}

export default App

function AuthPanel() {
  const [user, setUser] = useState(() => auth?.currentUser ?? null)
  useEffect(() => {
    if (!auth) return
    return auth.onAuthStateChanged(u => setUser(u))
  }, [])
  if (!auth) return null
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
      {user ? (
        <>
          <img src={user.photoURL ?? ''} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
          <span>{user.displayName ?? user.email}</span>
          <button onClick={() => signOut()}>Sign out</button>
        </>
      ) : (
        <button onClick={() => signInWithGoogle()}>Sign in with Google</button>
      )}
    </div>
  )
}
