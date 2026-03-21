import { useState } from 'react'
import './Link.css'

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

export interface LinkItem {
  id: string
  type: 'link'
  name: string
  description: string
  href: string
}

export interface FolderItem {
  id: string
  type: 'folder'
  name: string
  description: string
  password?: string
  children: TreeItem[]
}

export type TreeItem = LinkItem | FolderItem

interface BreadcrumbEntry { id: string; name: string }
type FormMode = 'link' | 'folder'
interface FormState { name: string; description: string; href: string; password: string }

/* ─────────────────────────────────────────────
   Tree helpers (pure functions)
   ───────────────────────────────────────────── */

function getChildrenAtPath(children: TreeItem[], path: string[]): TreeItem[] | null {
  if (path.length === 0) return children
  const [head, ...tail] = path
  const node = children.find(c => c.id === head)
  if (!node || node.type !== 'folder') return null
  return getChildrenAtPath(node.children, tail)
}

function treeAdd(children: TreeItem[], path: string[], item: TreeItem): TreeItem[] {
  if (path.length === 0) return [...children, item]
  return children.map(c => {
    if (c.id !== path[0] || c.type !== 'folder') return c
    return { ...c, children: treeAdd(c.children, path.slice(1), item) }
  })
}

function treeUpdate(children: TreeItem[], targetId: string, patch: Partial<TreeItem>): TreeItem[] {
  return children.map(c => {
    if (c.id === targetId) return { ...c, ...patch } as TreeItem
    if (c.type === 'folder') return { ...c, children: treeUpdate(c.children, targetId, patch) }
    return c
  })
}

function treeDelete(children: TreeItem[], targetId: string): TreeItem[] {
  return children
    .filter(c => c.id !== targetId)
    .map(c => {
      if (c.type === 'folder') return { ...c, children: treeDelete(c.children, targetId) }
      return c
    })
}

function buildBreadcrumbs(children: TreeItem[], path: string[]): BreadcrumbEntry[] {
  const crumbs: BreadcrumbEntry[] = []
  let current = children
  for (const id of path) {
    const node = current.find(c => c.id === id)
    if (!node || node.type !== 'folder') break
    crumbs.push({ id, name: node.name })
    current = node.children
  }
  return crumbs
}

/* ─────────────────────────────────────────────
   Default data
   ───────────────────────────────────────────── */

const EMPTY_FORM: FormState = { name: '', description: '', href: '', password: '' }

/* ─────────────────────────────────────────────
   Icons
   ───────────────────────────────────────────── */

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

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

interface Props {
  root: TreeItem[]
  onRootChange: (root: TreeItem[]) => void
  onBack: () => void
}

export default function LinkPage({ root, onRootChange, onBack }: Props) {
  const [isDark, setIsDark] = useState(false)
  const [navPath, setNavPath] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<FormMode>('link')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // Password modal
  type PwdAction = 'enter' | 'edit' | 'delete'
  interface PasswordModal { action: PwdAction; itemId: string }
  const [passwordModal, setPasswordModal] = useState<PasswordModal | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')

  // Delete confirm modal
  interface DeleteConfirmModal { itemId: string; itemName: string }
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<DeleteConfirmModal | null>(null)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')

  // Derived
  const currentItems = getChildrenAtPath(root, navPath) ?? []
  const breadcrumbs = buildBreadcrumbs(root, navPath)

  // Editing item (for conditional rendering)
  const editingItem = editingId ? currentItems.find(i => i.id === editingId) ?? null : null
  const showHref = editingId ? editingItem?.type === 'link' : formMode === 'link'

  /* ── CRUD handlers ── */

  function handleAdd() {
    if (!form.name.trim()) return
    if (formMode === 'link' && !form.href.trim()) return
    const id = Date.now().toString()
    const newItem: TreeItem = formMode === 'folder'
      ? { id, type: 'folder', name: form.name, description: form.description,
          ...(form.password.trim() ? { password: form.password.trim() } : {}),
          children: [] }
      : { id, type: 'link', name: form.name, description: form.description, href: form.href }
    onRootChange(treeAdd(root, navPath, newItem))
    setForm(EMPTY_FORM)
  }

  function handleEditStart(item: TreeItem) {
    if (item.type === 'folder' && item.password) {
      setPasswordModal({ action: 'edit', itemId: item.id })
      setPasswordInput('')
      setPasswordError('')
      return
    }
    _doEditStart(item)
  }

  function _doEditStart(item: TreeItem) {
    setEditingId(item.id)
    setFormMode(item.type)
    setForm({
      name: item.name,
      description: item.description,
      href: item.type === 'link' ? item.href : '',
      password: item.type === 'folder' ? (item.password ?? '') : '',
    })
  }

  function handleEditSave() {
    if (!editingId || !form.name.trim()) return
    const patch: Partial<TreeItem> = editingItem?.type === 'link'
      ? { name: form.name, description: form.description, href: form.href }
      : { name: form.name, description: form.description,
          ...(form.password.trim() ? { password: form.password.trim() } : { password: undefined }) }
    onRootChange(treeUpdate(root, editingId, patch))
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleEditCancel() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function _doDelete(id: string) {
    onRootChange(treeDelete(root, id))
    if (navPath.includes(id)) setNavPath(prev => prev.slice(0, prev.indexOf(id)))
    if (editingId === id) { setEditingId(null); setForm(EMPTY_FORM) }
  }

  function handleDelete(id: string) {
    const item = currentItems.find(i => i.id === id)
    setDeleteConfirmModal({ itemId: id, itemName: item?.name ?? '' })
    setDeleteConfirmInput('')
  }

  function handleDeleteConfirm() {
    if (!deleteConfirmModal || deleteConfirmInput !== 'DELETE') return
    const { itemId } = deleteConfirmModal
    setDeleteConfirmModal(null)
    setDeleteConfirmInput('')
    const item = currentItems.find(i => i.id === itemId)
    if (item?.type === 'folder' && item.password) {
      setPasswordModal({ action: 'delete', itemId })
      setPasswordInput('')
      setPasswordError('')
      return
    }
    _doDelete(itemId)
  }

  function handleDeleteCancel() {
    setDeleteConfirmModal(null)
    setDeleteConfirmInput('')
  }

  function _doEnterFolder(id: string) {
    setNavPath(prev => [...prev, id])
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleEnterFolder(id: string) {
    const item = currentItems.find(i => i.id === id)
    if (item?.type === 'folder' && item.password) {
      setPasswordModal({ action: 'enter', itemId: id })
      setPasswordInput('')
      setPasswordError('')
      return
    }
    _doEnterFolder(id)
  }

  function handlePasswordConfirm() {
    if (!passwordModal) return
    const item = currentItems.find(i => i.id === passwordModal.itemId)
    if (!item || item.type !== 'folder') return
    if (passwordInput !== item.password) {
      setPasswordError('密碼錯誤，請重試')
      return
    }
    const { action, itemId } = passwordModal
    setPasswordModal(null)
    setPasswordInput('')
    setPasswordError('')
    if (action === 'enter') _doEnterFolder(itemId)
    else if (action === 'edit') _doEditStart(item)
    else if (action === 'delete') _doDelete(itemId)
  }

  function handlePasswordCancel() {
    setPasswordModal(null)
    setPasswordInput('')
    setPasswordError('')
  }

  function handleBreadcrumbNavigate(index: number) {
    setNavPath(prev => prev.slice(0, index))
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  /* ── Render ── */

  return (
    <div className={`link-root${isDark ? '' : ' light'}`}>

      {/* Password Modal */}
      {passwordModal && (
        <div className="lk-overlay" onClick={handlePasswordCancel}>
          <div className="lk-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="lk-dialog-title">
              {passwordModal.action === 'enter' && '請輸入資料夾密碼'}
              {passwordModal.action === 'edit'  && '請輸入密碼以編輯'}
              {passwordModal.action === 'delete' && '請輸入密碼以刪除'}
            </h3>
            <input
              className="form-input"
              type="password"
              autoFocus
              value={passwordInput}
              maxLength={32}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError('') }}
              onKeyDown={e => e.key === 'Enter' && handlePasswordConfirm()}
              placeholder="輸入密碼"
            />
            {passwordError && <p className="lk-dialog-error">{passwordError}</p>}
            <div className="lk-dialog-actions">
              <button className="btn-primary" onClick={handlePasswordConfirm}>確認</button>
              <button className="btn-secondary" onClick={handlePasswordCancel}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirmModal && (
        <div className="lk-overlay" onClick={handleDeleteCancel}>
          <div className="lk-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="lk-dialog-title">確認刪除</h3>
            <p className="lk-dialog-desc">
              即將刪除「<strong>{deleteConfirmModal.itemName}</strong>」，此操作無法復原。<br />
              請輸入 <code className="lk-delete-code">DELETE</code> 以確認。
            </p>
            <input
              className="form-input"
              autoFocus
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDeleteConfirm()}
              placeholder="輸入 DELETE"
            />
            <div className="lk-dialog-actions">
              <button
                className="btn-danger"
                onClick={handleDeleteConfirm}
                disabled={deleteConfirmInput !== 'DELETE'}
              >
                刪除
              </button>
              <button className="btn-secondary" onClick={handleDeleteCancel}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Controls */}
      <div className="link-top-controls">
        <button className="lk-icon-btn lk-back" onClick={onBack} aria-label="返回首頁">
          <HomeIcon />
        </button>
        <button
          className="lk-icon-btn"
          onClick={() => setIsDark(!isDark)}
          aria-label={isDark ? '切換為亮色模式' : '切換為深色模式'}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      <div className="link-layout">

        {/* ── Main Content ── */}
        <main className="link-main">
          <header className="link-header">
            <p className="link-eyebrow">File Center</p>
            <h1 className="link-title">頁面<em>連結</em></h1>
            <div className="link-divider" />
            <p className="link-subtitle">點擊卡片前往連結，或點擊資料夾進入子目錄</p>
          </header>

          {/* Breadcrumb */}
          <nav className="link-breadcrumb" aria-label="目前路徑">
            <button
              className={`lk-crumb lk-crumb--root${navPath.length === 0 ? ' lk-crumb--current' : ''}`}
              onClick={() => handleBreadcrumbNavigate(0)}
              disabled={navPath.length === 0}
            >
              首頁
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.id} className="lk-crumb-group">
                <span className="lk-crumb-sep">/</span>
                <button
                  className={`lk-crumb${i === breadcrumbs.length - 1 ? ' lk-crumb--current' : ''}`}
                  onClick={() => handleBreadcrumbNavigate(i + 1)}
                  disabled={i === breadcrumbs.length - 1}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>

          {/* Card Grid */}
          <div className="link-grid">
            {currentItems.length === 0 && (
              <p className="link-empty">尚未新增任何項目，請使用右側側邊欄新增。</p>
            )}

            {currentItems.map((item, i) =>
              item.type === 'folder' ? (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={`lk-card lk-card--folder${editingId === item.id ? ' lk-card--editing' : ''}`}
                  style={{ animationDelay: `${i * 0.07 + 0.1}s` }}
                  onClick={() => handleEnterFolder(item.id)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleEnterFolder(item.id)}
                >
                  <span className="lk-card-index">{String(i + 1).padStart(2, '0')}</span>
                  <div className="lk-card-folder-icon">
                    <FolderIcon />
                    {item.password && <span className="lk-card-lock"><LockIcon /></span>}
                  </div>
                  <div className="lk-card-name">{item.name}</div>
                  <p className="lk-card-desc">{item.description}</p>
                  <div className="lk-card-footer">
                    <span className="lk-card-arrow">→</span>
                    <span className="lk-card-status">{item.children.length} 個項目</span>
                  </div>
                </div>
              ) : (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`lk-card${editingId === item.id ? ' lk-card--editing' : ''}`}
                  style={{ animationDelay: `${i * 0.07 + 0.1}s` }}
                >
                  <span className="lk-card-index">{String(i + 1).padStart(2, '0')}</span>
                  <div className="lk-card-name">{item.name}</div>
                  <p className="lk-card-desc">{item.description}</p>
                  <div className="lk-card-footer">
                    <span className="lk-card-arrow">→</span>
                    <span className="lk-card-status">前往</span>
                  </div>
                </a>
              )
            )}
          </div>
        </main>

        {/* ── Sidebar ── */}
        <aside className="link-sidebar">

          {/* Form Section */}
          <div className="sidebar-section">
            {editingId ? (
              <h2 className="sidebar-heading">
                {editingItem?.type === 'folder' ? '編輯資料夾' : '編輯連結'}
              </h2>
            ) : (
              <div className="form-tabs">
                <button
                  className={`form-tab${formMode === 'link' ? ' form-tab--active' : ''}`}
                  onClick={() => { setFormMode('link'); setForm(EMPTY_FORM) }}
                >
                  新增連結
                </button>
                <button
                  className={`form-tab${formMode === 'folder' ? ' form-tab--active' : ''}`}
                  onClick={() => { setFormMode('folder'); setForm(EMPTY_FORM) }}
                >
                  新增資料夾
                </button>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">名稱</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={formMode === 'folder' ? '資料夾名稱' : '連結名稱'}
              />
            </div>

            {showHref && (
              <div className="form-group">
                <label className="form-label">網址</label>
                <input
                  className="form-input"
                  value={form.href}
                  onChange={e => setForm({ ...form, href: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">描述</label>
              <textarea
                className="form-input form-textarea"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="簡短描述..."
                rows={3}
              />
            </div>

            {(formMode === 'folder' || editingItem?.type === 'folder') && (
              <div className="form-group">
                <label className="form-label">密碼（選填，最多 32 字元）</label>
                <input
                  className="form-input"
                  type="password"
                  value={form.password}
                  maxLength={32}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="留空表示不設密碼"
                />
              </div>
            )}

            <div className="form-actions">
              {editingId ? (
                <>
                  <button className="btn-primary" onClick={handleEditSave}
                    disabled={!form.name.trim()}>
                    儲存
                  </button>
                  <button className="btn-secondary" onClick={handleEditCancel}>取消</button>
                </>
              ) : (
                <button
                  className="btn-primary btn-primary--full"
                  onClick={handleAdd}
                  disabled={!form.name.trim() || (formMode === 'link' && !form.href.trim())}
                >
                  <PlusIcon />
                  {formMode === 'folder' ? '新增資料夾' : '新增連結'}
                </button>
              )}
            </div>
          </div>

          <div className="sidebar-rule" />

          {/* List Section */}
          <div className="sidebar-section">
            <h2 className="sidebar-heading">
              項目清單
              <span className="sidebar-count">{currentItems.length}</span>
            </h2>

            {currentItems.length === 0
              ? <p className="sidebar-empty">尚無項目</p>
              : (
                <ul className="sidebar-list">
                  {currentItems.map(item => (
                    <li
                      key={item.id}
                      className={`sidebar-item${editingId === item.id ? ' sidebar-item--active' : ''}`}
                    >
                      <span className="sidebar-item-type">
                        {item.type === 'folder' ? <FolderIcon /> : <LinkIcon />}
                      </span>
                      <div className="sidebar-item-info">
                        <span className="sidebar-item-name">{item.name}</span>
                        {item.description && (
                          <span className="sidebar-item-desc">{item.description}</span>
                        )}
                      </div>
                      <div className="sidebar-item-actions">
                        <button className="sib-btn" onClick={() => handleEditStart(item)} aria-label="編輯">
                          <EditIcon />
                        </button>
                        <button className="sib-btn sib-btn--danger" onClick={() => handleDelete(item.id)} aria-label="刪除">
                          <TrashIcon />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            }
          </div>

        </aside>
      </div>
    </div>
  )
}
