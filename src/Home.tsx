import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import "./Home.css";

interface NavItem {
  index: string;
  name: string;
  description: string;
  href?: string;
  page?: string;
  disabled?: boolean;
  forRole?: 'user' | 'admin';
}

const NAV_ITEMS: NavItem[] = [
  {
    index: "02",
    name: "LLM 問答",
    description: "串接 OpenAI API，進行智慧問答對話，支援多輪上下文。",
    page: "chat",
  },
  {
    index: "03",
    name: "民國人物傳",
    description: "胡適、魯迅、傅斯年——民國思想巨擘的生平與著述。",
    page: "celebrity",
  },
  {
    index: "04",
    name: "學習者",
    description: "以主題為單位的互動式學習，支援程式練習與行動建議。",
    page: "learner",
  },
  {
    index: "05",
    name: "電子書問答",
    description: "上傳 EPUB，自動分章整理，以 AI 深度問答書本內容。",
    page: "ebook",
  },
  {
    index: "06",
    name: "文獻探索",
    description: "輸入主題與需求描述，自動搜尋公開學術論文，選取 PDF 與 AI 深度問答。",
    page: "paper",
  },
  {
    index: "07",
    name: "帳戶管理",
    description: "查看個人資料、修改密碼、檢視 Token 使用統計。",
    page: "user-manage",
    forRole: "user",
  },
  {
    index: "08",
    name: "系統管理",
    description: "管理所有使用者帳號與 Token 用量統計。",
    page: "admin-manage",
    forRole: "admin",
  },
];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" /><line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" /><line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function UserCircleIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="8" r="3" />
      <path d="M6.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(false);
  const { user, login, logout } = useAuth();

  const [popupOpen, setPopupOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopupOpen(false);
      }
    }
    if (popupOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popupOpen]);

  function openPopup() {
    setPopupOpen(true);
    setAuthError('');
    setUsername('');
    setPassword('');
    setMode('login');
    setShowPw(false);
  }

  async function handleAuth() {
    if (!username.trim() || !password.trim()) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
        setPopupOpen(false);
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const data = await res.json();
        if (!res.ok) { setAuthError(data.error ?? '註冊失敗'); return; }
        await login(username.trim(), password);
        setPopupOpen(false);
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : '發生錯誤');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    setPopupOpen(false);
  }

  const iconColor = user
    ? user.role === 'admin' ? '#4caf7d' : '#4a9eff'
    : 'var(--muted-home)';

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.forRole) return true;
    if (!user) return false;
    return item.forRole === user.role;
  });

  return (
    <div className={`home-root${isDark ? "" : " light"}`}>
      {/* Top-right controls */}
      <div className="home-top-controls">
        <button
          className="theme-toggle"
          onClick={() => setIsDark(!isDark)}
          aria-label={isDark ? "切換為亮色模式" : "切換為深色模式"}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* User icon + popup */}
        <div className="home-user-wrap" ref={popupRef}>
        <button
          className="home-user-btn"
          onClick={user ? (popupOpen ? () => setPopupOpen(false) : openPopup) : openPopup}
          aria-label="帳號"
          title={user ? user.username : '登入'}
        >
          <UserCircleIcon color={iconColor} />
          {user && <span className="home-user-name" style={{ color: iconColor }}>{user.username}</span>}
        </button>

        {popupOpen && (
          <div className={`home-auth-popup${isDark ? '' : ' light'}`}>
            {user ? (
              /* Logged in: show user info + actions */
              <div className="home-popup-logged">
                <div className="home-popup-user-row">
                  <span style={{ color: iconColor, fontWeight: 700 }}>{user.username}</span>
                  <span className="home-popup-role-badge" style={{ color: iconColor }}>
                    {user.role === 'admin' ? '管理員' : '使用者'}
                  </span>
                </div>
                {user.role !== 'admin' && (
                  <button className="home-popup-btn" onClick={() => { setPopupOpen(false); navigate('/user-manage'); }}>
                    帳戶管理
                  </button>
                )}
                {user.role === 'admin' && (
                  <button className="home-popup-btn" onClick={() => { setPopupOpen(false); navigate('/admin-manage'); }}>
                    系統管理
                  </button>
                )}
                <button className="home-popup-btn home-popup-btn--danger" onClick={handleLogout}>
                  登出
                </button>
              </div>
            ) : (
              /* Guest: show login / register form */
              <div className="home-popup-form">
                <div className="home-popup-tabs">
                  <button className={`home-popup-tab${mode === 'login' ? ' active' : ''}`} onClick={() => { setMode('login'); setAuthError(''); }}>登入</button>
                  <button className={`home-popup-tab${mode === 'register' ? ' active' : ''}`} onClick={() => { setMode('register'); setAuthError(''); }}>註冊</button>
                </div>
                <input
                  className="home-popup-input"
                  type="text"
                  placeholder="帳號"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  autoComplete="username"
                />
                <div className="home-popup-pw-wrap">
                  <input
                    className="home-popup-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="密碼"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAuth()}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button className="home-popup-eye" onClick={() => setShowPw(!showPw)} tabIndex={-1}>
                    {showPw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {authError && <p className="home-popup-error">{authError}</p>}
                <button
                  className="home-popup-submit"
                  onClick={handleAuth}
                  disabled={authLoading || !username.trim() || !password.trim()}
                >
                  {authLoading ? '處理中…' : mode === 'login' ? '登入' : '註冊'}
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      <header className="home-header">
        <p className="home-eyebrow">SD1 Center</p>
        <h1 className="home-title">
          SD1 <em>連結中心</em>
        </h1>
        <div className="home-divider" />
        <p className="home-subtitle">選取一個項目以繼續</p>
      </header>

      <nav className="home-grid">
        <button
          className="nav-card nav-card--active"
          onClick={() => navigate("/link")}
        >
          <span className="card-index">01</span>
          <div className="card-name">頁面連結</div>
          <p className="card-desc">
            新增、編輯或刪除自訂連結，打造專屬的快速導覽頁。
          </p>
          <div className="card-footer">
            <span className="card-arrow">→</span>
            <span className="card-status">前往</span>
          </div>
        </button>
        {visibleItems.map((item) =>
          item.disabled ? (
            <div key={item.index} className="nav-card nav-card--disabled" aria-disabled="true">
              <span className="card-index">{item.index}</span>
              <div className="card-name">{item.name}</div>
              <p className="card-desc">{item.description}</p>
              <div className="card-footer"><span className="card-badge">Coming Soon</span></div>
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
          ),
        )}
      </nav>
    </div>
  );
}
