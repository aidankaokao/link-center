import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import Home from './Home'
import Link, { type TreeItem } from './Link'
import Chat from './Chat'
import Tts from './Tts'

function AppRoutes() {
  const navigate = useNavigate()
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

  const goHome = () => navigate('/')

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/link" element={<Link root={root} onRootChange={handleRootChange} onBack={goHome} />} />
      <Route path="/chat" element={<Chat onBack={goHome} />} />
      <Route path="/tts" element={<Tts onBack={goHome} />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
