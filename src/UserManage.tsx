import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import './UserManage.css'

interface Props { onBack: () => void }

interface UsageRow { date: string; provider: string; total_tokens: number }

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#4a9eff',
  gemini: '#c8a96e',
  ollama: '#4caf7d',
}
const PROVIDERS = ['openai', 'gemini', 'ollama']

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export default function UserManage({ onBack }: Props) {
  const navigate = useNavigate()
  const { user, logout, refresh } = useAuth()
  const [isDark, setIsDark] = useState(false)

  // Password change
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  // Delete account
  const [deleteModal, setDeleteModal] = useState(false)
  const [deletePw, setDeletePw] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Token usage
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [usageLoading, setUsageLoading] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    setUsageLoading(true)
    fetch('/api/token-usage/me')
      .then(r => r.json())
      .then(data => setUsage(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setUsageLoading(false))
  }, [user, navigate])

  // ── Chart data ──

  // Last 30 days
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 29 + i)
    return d.toISOString().slice(0, 10)
  })

  const barData = last30.map(date => {
    const row: Record<string, unknown> = { date: date.slice(5) } // MM-DD
    for (const p of PROVIDERS) {
      const found = usage.find(u => u.date === date && u.provider === p)
      row[p] = found ? found.total_tokens : 0
    }
    return row
  })

  // This month pie
  const thisMonth = new Date().toISOString().slice(0, 7)
  const pieData = PROVIDERS.map(p => ({
    name: p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : 'Ollama',
    value: usage.filter(u => u.date.startsWith(thisMonth) && u.provider === p)
      .reduce((s, u) => s + u.total_tokens, 0),
    color: PROVIDER_COLORS[p],
  })).filter(d => d.value > 0)

  const totalTokens = usage.reduce((s, u) => s + u.total_tokens, 0)

  // ── Handlers ──

  async function handleChangePassword() {
    if (!oldPw || !newPw || !confirmPw) { setPwError('請填寫所有欄位'); return }
    if (newPw !== confirmPw) { setPwError('新密碼與確認密碼不相符'); return }
    if (newPw.length < 4) { setPwError('新密碼至少需要 4 個字元'); return }
    setPwLoading(true); setPwError(''); setPwSuccess(false)
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) { setPwError(data.error ?? '修改失敗'); return }
      setPwSuccess(true)
      setOldPw(''); setNewPw(''); setConfirmPw('')
    } catch { setPwError('發生錯誤，請稍後再試') }
    finally { setPwLoading(false) }
  }

  async function handleDeleteAccount() {
    if (!deletePw) { setDeleteError('請輸入密碼'); return }
    setDeleteLoading(true); setDeleteError('')
    try {
      const res = await fetch('/api/user/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePw }),
      })
      const data = await res.json()
      if (!res.ok) { setDeleteError(data.error ?? '刪除失敗'); return }
      await logout()
      navigate('/')
    } catch { setDeleteError('發生錯誤，請稍後再試') }
    finally { setDeleteLoading(false) }
  }

  void refresh

  if (!user) return null

  return (
    <div className={`um-root${isDark ? '' : ' light'}`}>
      {/* Topbar */}
      <div className="um-topbar">
        <div className="um-topbar-title">帳戶管理</div>
        <div className="um-topbar-actions">
          <button className="um-ctrl-btn" onClick={() => setIsDark(!isDark)} aria-label="切換主題">
            {isDark ? '☀' : '☽'}
          </button>
          <button className="um-ctrl-btn" onClick={onBack} aria-label="返回首頁">
            <HomeIcon />
          </button>
        </div>
      </div>

      <div className="um-content">

        {/* Profile card */}
        <section className="um-card">
          <h2 className="um-section-title">個人資料</h2>
          <div className="um-profile-row">
            <div className="um-profile-avatar">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="um-profile-name">{user.username}</div>
              <div className="um-profile-role">{user.role === 'admin' ? '管理員' : '一般使用者'}</div>
            </div>
          </div>
          <div className="um-stat-row">
            <div className="um-stat-item">
              <span className="um-stat-label">累積 Token</span>
              <span className="um-stat-value">{totalTokens.toLocaleString()}</span>
            </div>
          </div>
        </section>

        {/* Token usage charts */}
        <section className="um-card">
          <h2 className="um-section-title">Token 用量</h2>
          {usageLoading ? (
            <div className="um-loading">載入中…</div>
          ) : usage.length === 0 ? (
            <div className="um-empty">尚無使用記錄</div>
          ) : (
            <>
              <p className="um-chart-label">近 30 天每日用量</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0b1f40', border: '1px solid rgba(200,169,110,0.3)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#e8e4dc' }}
                    itemStyle={{ color: '#e8e4dc' }}
                  />
                  {PROVIDERS.map(p => (
                    <Bar key={p} dataKey={p} stackId="a" fill={PROVIDER_COLORS[p]}
                      name={p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : 'Ollama'}
                      radius={p === 'ollama' ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {pieData.length > 0 && (
                <>
                  <p className="um-chart-label" style={{ marginTop: 20 }}>本月 Provider 佔比</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                        paddingAngle={3}>
                        {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0b1f40', border: '1px solid rgba(200,169,110,0.3)', borderRadius: 8, fontSize: 12 }}
                        formatter={(v: unknown) => (v as number).toLocaleString() + ' tokens'}
                      />
                      <Legend iconType="circle" iconSize={10}
                        formatter={(v) => <span style={{ color: 'var(--text)', fontSize: 12 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </>
              )}
            </>
          )}
        </section>

        {/* Change password */}
        <section className="um-card">
          <h2 className="um-section-title">修改密碼</h2>
          <div className="um-form">
            <div className="um-pw-wrap">
              <input className="um-input" type={showOld ? 'text' : 'password'}
                placeholder="目前密碼" value={oldPw} onChange={e => setOldPw(e.target.value)} />
              <button className="um-eye-btn" onClick={() => setShowOld(!showOld)} tabIndex={-1}>
                {showOld ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className="um-pw-wrap">
              <input className="um-input" type={showNew ? 'text' : 'password'}
                placeholder="新密碼" value={newPw} onChange={e => setNewPw(e.target.value)} />
              <button className="um-eye-btn" onClick={() => setShowNew(!showNew)} tabIndex={-1}>
                {showNew ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <input className="um-input" type="password"
              placeholder="確認新密碼" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChangePassword()} />
            {pwError && <p className="um-error">{pwError}</p>}
            {pwSuccess && <p className="um-success">密碼已修改成功！</p>}
            <button className="um-btn-primary" onClick={handleChangePassword}
              disabled={pwLoading || !oldPw || !newPw || !confirmPw}>
              {pwLoading ? '處理中…' : '修改密碼'}
            </button>
          </div>
        </section>

        {/* Delete account */}
        <section className="um-card um-card--danger">
          <h2 className="um-section-title um-section-title--danger">刪除帳號</h2>
          <p className="um-danger-desc">刪除後所有資料將永久移除，此操作無法復原。</p>
          <button className="um-btn-danger" onClick={() => { setDeleteModal(true); setDeletePw(''); setDeleteError('') }}>
            刪除我的帳號
          </button>
        </section>

      </div>

      {/* Delete confirmation modal */}
      {deleteModal && (
        <div className="um-modal-overlay" onClick={() => setDeleteModal(false)}>
          <div className="um-modal" onClick={e => e.stopPropagation()}>
            <h3 className="um-modal-title">確認刪除帳號</h3>
            <p className="um-modal-desc">此操作無法復原。請輸入密碼以確認。</p>
            <input className="um-input" type="password" placeholder="密碼"
              value={deletePw} onChange={e => setDeletePw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDeleteAccount()} />
            {deleteError && <p className="um-error">{deleteError}</p>}
            <div className="um-modal-btns">
              <button className="um-btn-secondary" onClick={() => setDeleteModal(false)}>取消</button>
              <button className="um-btn-danger" onClick={handleDeleteAccount}
                disabled={deleteLoading || !deletePw}>
                {deleteLoading ? '處理中…' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
