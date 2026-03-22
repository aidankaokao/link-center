import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import './AdminManage.css'

interface Props { onBack: () => void }

interface UserRow { username: string; created_at: string }
interface UsageRow { username: string; date: string; provider: string; total_tokens: number }

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

export default function AdminManage({ onBack }: Props) {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [isDark, setIsDark] = useState(false)

  // Users
  const [users, setUsers] = useState<UserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<string | null>(null) // null = all users

  // Delete user
  const [deleteModal, setDeleteModal] = useState<string | null>(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Usage
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [usageLoading, setUsageLoading] = useState(false)

  // Data retention
  const [retentionDays, setRetentionDays] = useState(365)
  const [retentionLoading, setRetentionLoading] = useState(false)
  const [retentionError, setRetentionError] = useState('')
  const [retentionSuccess, setRetentionSuccess] = useState(false)

  // Admin password change
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/'); return }
    setUsersLoading(true)
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setUsersLoading(false))

    setUsageLoading(true)
    fetch('/api/token-usage/all')
      .then(r => r.json())
      .then(data => setUsage(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setUsageLoading(false))

    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => { if (data.token_retention_days) setRetentionDays(data.token_retention_days) })
      .catch(() => {})
  }, [user, navigate])

  void refresh

  // ── Chart data ──

  const filteredUsage = selectedUser === null ? usage : usage.filter(u => u.username === selectedUser)

  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 29 + i)
    return d.toISOString().slice(0, 10)
  })

  const barData = last30.map(date => {
    const row: Record<string, unknown> = { date: date.slice(5) }
    for (const p of PROVIDERS) {
      row[p] = filteredUsage.filter(u => u.date === date && u.provider === p)
        .reduce((s, u) => s + u.total_tokens, 0)
    }
    return row
  })

  const thisMonth = new Date().toISOString().slice(0, 7)
  const pieData = PROVIDERS.map(p => ({
    name: p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : 'Ollama',
    value: filteredUsage.filter(u => u.date.startsWith(thisMonth) && u.provider === p)
      .reduce((s, u) => s + u.total_tokens, 0),
    color: PROVIDER_COLORS[p],
  })).filter(d => d.value > 0)

  const totalAll = usage.reduce((s, u) => s + u.total_tokens, 0)
  const totalFiltered = filteredUsage.reduce((s, u) => s + u.total_tokens, 0)

  // ── Handlers ──

  async function handleDeleteUser() {
    if (deleteInput !== 'DELETE') { setDeleteError('請輸入 DELETE 確認'); return }
    if (!deleteModal) return
    setDeleteLoading(true); setDeleteError('')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(deleteModal)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setDeleteError(data.error ?? '刪除失敗'); return }
      setUsers(prev => prev.filter(u => u.username !== deleteModal))
      if (selectedUser === deleteModal) setSelectedUser(null)
      setDeleteModal(null)
    } catch { setDeleteError('發生錯誤，請稍後再試') }
    finally { setDeleteLoading(false) }
  }

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

  async function handleSaveRetention() {
    setRetentionLoading(true); setRetentionError(''); setRetentionSuccess(false)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_retention_days: retentionDays }),
      })
      const data = await res.json()
      if (!res.ok) { setRetentionError(data.error ?? '儲存失敗'); return }
      setRetentionSuccess(true)
    } catch { setRetentionError('發生錯誤，請稍後再試') }
    finally { setRetentionLoading(false) }
  }

  if (!user || user.role !== 'admin') return null

  return (
    <div className={`am-root${isDark ? '' : ' light'}`}>
      {/* Topbar */}
      <div className="am-topbar">
        <div className="am-topbar-title">系統管理</div>
        <div className="am-topbar-actions">
          <button className="am-ctrl-btn" onClick={() => setIsDark(!isDark)} aria-label="切換主題">
            {isDark ? '☀' : '☽'}
          </button>
          <button className="am-ctrl-btn" onClick={onBack} aria-label="返回首頁">
            <HomeIcon />
          </button>
        </div>
      </div>

      <div className="am-content">

        {/* Stats overview */}
        <section className="am-card">
          <h2 className="am-section-title">總覽</h2>
          <div className="am-stats-row">
            <div className="am-stat-item">
              <span className="am-stat-label">使用者數</span>
              <span className="am-stat-value">{users.length}</span>
            </div>
            <div className="am-stat-item">
              <span className="am-stat-label">全站 Token 累積</span>
              <span className="am-stat-value">{totalAll.toLocaleString()}</span>
            </div>
          </div>
        </section>

        {/* User list */}
        <section className="am-card">
          <h2 className="am-section-title">使用者列表</h2>
          {usersLoading ? (
            <div className="am-loading">載入中…</div>
          ) : users.length === 0 ? (
            <div className="am-empty">尚無使用者</div>
          ) : (
            <div className="am-user-list">
              {users.map(u => (
                <div key={u.username}
                  className={`am-user-row${selectedUser === u.username ? ' am-user-row--selected' : ''}`}
                  onClick={() => setSelectedUser(selectedUser === u.username ? null : u.username)}>
                  <div className="am-user-avatar">{u.username.slice(0, 1).toUpperCase()}</div>
                  <div className="am-user-info">
                    <span className="am-user-name">{u.username}</span>
                    <span className="am-user-date">
                      {new Date(u.created_at).toLocaleDateString('zh-TW')} 加入
                    </span>
                  </div>
                  <div className="am-user-tokens">
                    {usage.filter(r => r.username === u.username)
                      .reduce((s, r) => s + r.total_tokens, 0).toLocaleString()} tokens
                  </div>
                  <button className="am-delete-btn"
                    onClick={e => { e.stopPropagation(); setDeleteModal(u.username); setDeleteInput(''); setDeleteError('') }}>
                    刪除
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Token charts */}
        <section className="am-card">
          <h2 className="am-section-title">
            Token 用量
            {selectedUser && (
              <span className="am-filter-badge" onClick={() => setSelectedUser(null)}>
                {selectedUser} ✕
              </span>
            )}
          </h2>
          {usageLoading ? (
            <div className="am-loading">載入中…</div>
          ) : (
            <>
              <p className="am-chart-label">
                {selectedUser ? `${selectedUser} ` : '全站 '}近 30 天每日用量
                {selectedUser && <span className="am-filtered-total">（共 {totalFiltered.toLocaleString()} tokens）</span>}
              </p>
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
                  <p className="am-chart-label" style={{ marginTop: 20 }}>本月 Provider 佔比</p>
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

        {/* Data retention */}
        <section className="am-card">
          <h2 className="am-section-title">資料保留設定</h2>
          <p className="am-section-desc">Token 用量紀錄超過指定期間後將自動刪除。設定儲存後立即生效。</p>
          <div className="am-retention-row">
            <select
              className="am-select"
              value={retentionDays}
              onChange={e => { setRetentionDays(Number(e.target.value)); setRetentionSuccess(false) }}
            >
              <option value={30}>一個月（30 天）</option>
              <option value={60}>兩個月（60 天）</option>
              <option value={90}>三個月（90 天）</option>
              <option value={180}>半年（180 天）</option>
              <option value={365}>一年（365 天）</option>
            </select>
            <button className="am-btn-primary" onClick={handleSaveRetention} disabled={retentionLoading}>
              {retentionLoading ? '儲存中…' : '儲存'}
            </button>
          </div>
          {retentionError && <p className="am-error">{retentionError}</p>}
          {retentionSuccess && <p className="am-success">設定已儲存，舊資料已清除。</p>}
        </section>

        {/* Admin password change */}
        <section className="am-card">
          <h2 className="am-section-title">修改管理員密碼</h2>
          <div className="am-form">
            <div className="am-pw-wrap">
              <input className="am-input" type={showOld ? 'text' : 'password'}
                placeholder="目前密碼" value={oldPw} onChange={e => setOldPw(e.target.value)} />
              <button className="am-eye-btn" onClick={() => setShowOld(!showOld)} tabIndex={-1}>
                {showOld ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className="am-pw-wrap">
              <input className="am-input" type={showNew ? 'text' : 'password'}
                placeholder="新密碼" value={newPw} onChange={e => setNewPw(e.target.value)} />
              <button className="am-eye-btn" onClick={() => setShowNew(!showNew)} tabIndex={-1}>
                {showNew ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <input className="am-input" type="password"
              placeholder="確認新密碼" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChangePassword()} />
            {pwError && <p className="am-error">{pwError}</p>}
            {pwSuccess && <p className="am-success">密碼已修改成功！</p>}
            <button className="am-btn-primary" onClick={handleChangePassword}
              disabled={pwLoading || !oldPw || !newPw || !confirmPw}>
              {pwLoading ? '處理中…' : '修改密碼'}
            </button>
          </div>
        </section>

      </div>

      {/* Delete user modal */}
      {deleteModal && (
        <div className="am-modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="am-modal" onClick={e => e.stopPropagation()}>
            <h3 className="am-modal-title">確認刪除使用者</h3>
            <p className="am-modal-desc">將刪除使用者 <strong>{deleteModal}</strong> 及其所有資料。請輸入 <code>DELETE</code> 確認。</p>
            <input className="am-input" type="text" placeholder="DELETE"
              value={deleteInput} onChange={e => setDeleteInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDeleteUser()} />
            {deleteError && <p className="am-error">{deleteError}</p>}
            <div className="am-modal-btns">
              <button className="am-btn-secondary" onClick={() => setDeleteModal(null)}>取消</button>
              <button className="am-btn-danger" onClick={handleDeleteUser}
                disabled={deleteLoading || deleteInput !== 'DELETE'}>
                {deleteLoading ? '處理中…' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
