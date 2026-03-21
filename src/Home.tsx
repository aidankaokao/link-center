import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Home.css'

interface NavItem {
  index: string
  name: string
  description: string
  href?: string
  page?: string
  disabled?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    index: '02',
    name: 'LLM 問答',
    description: '串接 OpenAI API，進行智慧問答對話，支援多輪上下文。',
    page: 'chat',
  },
]

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2"  x2="12" y2="5"  />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="4.22" y1="4.22"  x2="6.34" y2="6.34"  />
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
      <line x1="2"  y1="12" x2="5"  y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34"  x2="19.78" y2="4.22"  />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [isDark, setIsDark] = useState(false)

  return (
    <div className={`home-root${isDark ? '' : ' light'}`}>
      <button
        className="theme-toggle"
        onClick={() => setIsDark(!isDark)}
        aria-label={isDark ? '切換為亮色模式' : '切換為深色模式'}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>

      <header className="home-header">
        <p className="home-eyebrow">File Center</p>
        <h1 className="home-title">
          My Team <em>管理中心</em>
        </h1>
        <div className="home-divider" />
        <p className="home-subtitle">選取一個項目以繼續</p>
      </header>

      <nav className="home-grid">
        <button
          className="nav-card nav-card--active"
          onClick={() => navigate('/link')}
        >
          <span className="card-index">01</span>
          <div className="card-name">頁面連結</div>
          <p className="card-desc">新增、編輯或刪除自訂連結，打造專屬的快速導覽頁。</p>
          <div className="card-footer">
            <span className="card-arrow">→</span>
            <span className="card-status">前往</span>
          </div>
        </button>
        {NAV_ITEMS.map((item) =>
          item.disabled ? (
            <div key={item.index} className="nav-card nav-card--disabled" aria-disabled="true">
              <span className="card-index">{item.index}</span>
              <div className="card-name">{item.name}</div>
              <p className="card-desc">{item.description}</p>
              <div className="card-footer">
                <span className="card-badge">Coming Soon</span>
              </div>
            </div>
          ) : item.page ? (
            <button key={item.index} className="nav-card nav-card--active" onClick={() => navigate(`/${item.page!}`)}>
              <span className="card-index">{item.index}</span>
              <div className="card-name">{item.name}</div>
              <p className="card-desc">{item.description}</p>
              <div className="card-footer">
                <span className="card-arrow">→</span>
                <span className="card-status">前往</span>
              </div>
            </button>
          ) : (
            <a key={item.index} href={item.href} target="_blank" rel="noopener noreferrer" className="nav-card nav-card--active">
              <span className="card-index">{item.index}</span>
              <div className="card-name">{item.name}</div>
              <p className="card-desc">{item.description}</p>
              <div className="card-footer">
                <span className="card-arrow">→</span>
                <span className="card-status">前往</span>
              </div>
            </a>
          )
        )}
      </nav>
    </div>
  )
}
