import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthUserIcon from './AuthUserIcon'
import './Game.css'

interface Props { onBack: () => void }

const GAMES = [
  { en: 'Snake',    name: '貪食蛇',    description: '以方向鍵控制蛇移動，吃掉食物讓蛇變長，避免撞牆或撞到自己。', page: 'snake' },
  { en: 'Tetris',   name: '俄羅斯方塊', description: '旋轉並排列落下的方塊，消除完整的橫列以得分。', page: 'tetris' },
  { en: 'Breakout', name: '打磚塊',    description: '控制擋板反彈球，打破所有磚塊，通關後速度加快。', page: 'breakout' },
  { en: 'Flappy',   name: '飛翔小鳥',  description: '按空白鍵讓小鳥飛翔，穿越不斷出現的水管。', page: 'flappy' },
  { en: 'Invaders', name: '太空侵略者', description: '移動砲台射擊外星人，阻止入侵地球。', page: 'invaders' },
]

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" /><line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" /><line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
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

export default function Game({ onBack }: Props) {
  const navigate = useNavigate()
  const [isDark, setIsDark] = useState(true)

  return (
    <div className={`gm-root${isDark ? '' : ' light'}`}>
      {/* Topbar */}
      <div className="gm-topbar">
        <div className="gm-topbar-left">
          <button className="gm-ctrl-btn" onClick={onBack} aria-label="返回首頁">
            <HomeIcon />
          </button>
          <span className="gm-topbar-title">遊戲中心</span>
        </div>
        <div className="gm-topbar-right">
          <button className="gm-ctrl-btn" onClick={() => setIsDark(!isDark)} aria-label="切換主題">
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className="gm-user-icon">
            <AuthUserIcon />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="gm-content">
        <header className="gm-header">
          <p className="gm-eyebrow">Game Center</p>
          <h1 className="gm-title">選擇遊戲</h1>
          <div className="gm-divider" />
        </header>

        <nav className="gm-grid">
          {GAMES.map((game) => (
            <button
              key={game.page}
              className="gm-card"
              onClick={() => navigate(`/${game.page}`)}
            >
              <span className="gm-card-index">{game.en}</span>
              <div className="gm-card-name">{game.name}</div>
              <p className="gm-card-desc">{game.description}</p>
              <div className="gm-card-footer">
                <span className="gm-card-arrow">→</span>
                <span className="gm-card-status">開始</span>
              </div>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
