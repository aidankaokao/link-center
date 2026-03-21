import { useState, useEffect } from 'react'
import Home from './Home'
import Link, { type TreeItem } from './Link'
import Chat from './Chat'
import Tts from './Tts'

export type Page = 'home' | 'link' | 'chat' | 'tts'

function App() {
  const [page, setPage] = useState<Page>('home')
  const [root, setRoot] = useState<TreeItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/links')
      .then(r => r.json())
      .then((data: TreeItem[]) => setRoot(data))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const handleRootChange = (newRoot: TreeItem[]) => {
    setRoot(newRoot)
    fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRoot),
    }).catch(() => {})
  }

  if (!loaded) return null

  if (page === 'link') return (
    <Link root={root} onRootChange={handleRootChange} onBack={() => setPage('home')} />
  )
  if (page === 'chat') return (
    <Chat onBack={() => setPage('home')} />
  )
  if (page === 'tts') return (
    <Tts onBack={() => setPage('home')} />
  )
  return <Home onNavigate={setPage} />
}

export default App
