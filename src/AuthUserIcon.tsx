import { useAuth } from './AuthContext'

/**
 * Display-only user icon for non-Home pages.
 * Shows grey (guest), blue (user), or green (admin).
 * No click interaction.
 */
export default function AuthUserIcon() {
  const { user } = useAuth()
  const color = user
    ? user.role === 'admin' ? '#4caf7d' : '#4a9eff'
    : 'var(--muted)'

  return (
    <div title={user ? `${user.username} (${user.role === 'admin' ? '管理員' : '使用者'})` : '未登入'} style={{ display: 'flex', alignItems: 'center', width: 20, height: 20 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="8" r="3" />
        <path d="M6.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      </svg>
    </div>
  )
}
