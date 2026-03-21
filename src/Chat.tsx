import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './Chat.css'

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface UploadedFile {
  name: string
  type: 'image' | 'pdf'
  content: string    // image: base64 (no data: prefix); pdf: extracted plain text
  mimeType?: string  // image only
}

/* ─────────────────────────────────────────────
   CSV export helpers
   ───────────────────────────────────────────── */

function hasMarkdownTable(content: string): boolean {
  return /\|[ \t]*[-:]+[ \t]*\|/.test(content)
}

function markdownToCsv(content: string): string {
  const lines = content.split('\n')
  const csvBlocks: string[] = []
  let currentBlock: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (/^\|[ \t:|-]+\|$/.test(trimmed)) continue // skip separator row
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => {
          const val = c.trim()
          return /[,"\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val
        })
      currentBlock.push(cells.join(','))
    } else if (currentBlock.length > 0) {
      csvBlocks.push(currentBlock.join('\n'))
      currentBlock = []
    }
  }
  if (currentBlock.length > 0) csvBlocks.push(currentBlock.join('\n'))
  return csvBlocks.join('\n\n')
}

function downloadAsCsv(content: string, msgId: string): void {
  const csv = markdownToCsv(content)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `table-${msgId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ─────────────────────────────────────────────
   File helpers
   ───────────────────────────────────────────── */

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    pages.push(textContent.items.map((item: any) => ('str' in item ? item.str : '')).join(' '))
  }
  return pages.join('\n\n')
}

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

function ChevronsLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  )
}

function ChevronsRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="13 17 18 12 13 7" />
      <polyline points="6 17 11 12 6 7" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <line x1="12" y1="7" x2="12" y2="11" />
      <line x1="8" y1="15" x2="8" y2="15" strokeWidth="2.5" />
      <line x1="12" y1="15" x2="12" y2="15" strokeWidth="2.5" />
      <line x1="16" y1="15" x2="16" y2="15" strokeWidth="2.5" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function DownloadCsvIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ImageFileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function PdfFileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
      <line x1="9" y1="9"  x2="11" y2="9"  />
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

interface Props {
  onBack: () => void
}

export default function Chat({ onBack }: Props) {
  const [isDark, setIsDark] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savedApiKey, setSavedApiKey] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [processingFile, setProcessingFile] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasApiKey = savedApiKey.trim().length > 0

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function handleSaveKey() {
    setSavedApiKey(apiKeyInput.trim())
    setError(null)
  }

  function handleClearKey() {
    setSavedApiKey('')
    setApiKeyInput('')
    setMessages([])
    setError(null)
  }

  async function handleSend() {
    if (!hasApiKey || !input.trim() || loading) return
    setError(null)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }

    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setLoading(true)

    const assistantId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${savedApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: (() => {
            const arr: any[] = []
            if (uploadedFile?.type === 'pdf') {
              arr.push({
                role: 'system',
                content: `以下是使用者上傳的文件「${uploadedFile.name}」，請根據此文件內容回答問題：\n\n${uploadedFile.content}`,
              })
            }
            updatedMessages.forEach((m, i) => {
              const isLastUser = i === updatedMessages.length - 1 && m.role === 'user'
              if (isLastUser && uploadedFile?.type === 'image') {
                arr.push({
                  role: 'user',
                  content: [
                    { type: 'text', text: m.content },
                    { type: 'image_url', image_url: { url: `data:${uploadedFile.mimeType};base64,${uploadedFile.content}` } },
                  ],
                })
              } else {
                arr.push({ role: m.role, content: m.content })
              }
            })
            return arr
          })(),
          stream: true,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error?.message ?? `HTTP ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content ?? ''
            accumulated += delta
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m)
            )
          } catch { /* skip malformed chunks */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '發生未知錯誤'
      setError(msg)
      setMessages(prev => prev.filter(m => m.id !== assistantId))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessingFile(true)
    setError(null)
    try {
      if (file.type.startsWith('image/')) {
        const base64 = await readFileAsBase64(file)
        setUploadedFile({ name: file.name, type: 'image', content: base64, mimeType: file.type })
      } else if (file.type === 'application/pdf') {
        const text = await extractPdfText(file)
        setUploadedFile({ name: file.name, type: 'pdf', content: text })
      }
    } catch {
      setError('檔案讀取失敗，請確認格式是否正確。')
    } finally {
      setProcessingFile(false)
      e.target.value = ''
    }
  }

  /* ── Render ── */
  return (
    <div className={`chat-root${isDark ? '' : ' light'}`}>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Sidebar */}
      <aside className={`chat-sidebar${sidebarOpen ? '' : ' chat-sidebar--collapsed'}`}>
        <div className="sidebar-top">
          {sidebarOpen && (
            <span className="sidebar-brand">設定</span>
          )}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? '收合側邊欄' : '展開側邊欄'}
          >
            {sidebarOpen ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
          </button>
        </div>

        {sidebarOpen && (
          <div className="sidebar-body">
            <div className="sidebar-section-label">
              <KeyIcon />
              <span>OpenAI API Key</span>
            </div>

            <input
              className="sidebar-input"
              type="password"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
              placeholder="sk-..."
              autoComplete="off"
            />

            <div className="sidebar-key-actions">
              <button
                className="sidebar-btn sidebar-btn--primary"
                onClick={handleSaveKey}
                disabled={!apiKeyInput.trim()}
              >
                儲存
              </button>
              {savedApiKey && (
                <button className="sidebar-btn sidebar-btn--danger" onClick={handleClearKey}>
                  清除
                </button>
              )}
            </div>

            <div className={`sidebar-key-status${hasApiKey ? ' sidebar-key-status--ok' : ''}`}>
              <span className="status-dot" />
              <span>{hasApiKey ? 'API Key 已設定' : '尚未設定 API Key'}</span>
            </div>

            <p className="sidebar-hint">
              Key 僅存於記憶體，關閉頁面後自動清除。
            </p>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="chat-main">

        {/* Top bar */}
        <div className="chat-topbar">
          <div className="chat-topbar-title">
            <BotIcon />
            <span>AI 問答</span>
          </div>
          <div className="chat-topbar-actions">
            <button className="chat-ctrl-btn" onClick={() => setIsDark(!isDark)}
              aria-label={isDark ? '切換亮色' : '切換深色'}>
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="chat-ctrl-btn" onClick={onBack} aria-label="返回首頁">
              <HomeIcon />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              {hasApiKey
                ? <>
                    <BotIcon />
                    <p>你好！有什麼我可以幫你的嗎？</p>
                  </>
                : <>
                    <KeyIcon />
                    <p>請先在左側側邊欄輸入 OpenAI API Key 以開始對話。</p>
                  </>
              }
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
              <div className="chat-msg-avatar">
                {msg.role === 'assistant' ? <BotIcon /> : <UserIcon />}
              </div>
              <div className="chat-msg-bubble">
                {msg.content
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  : <span className="chat-typing"><span /><span /><span /></span>
                }
              </div>
              {msg.role === 'assistant' && msg.content && hasMarkdownTable(msg.content) && (
                <button
                  className="chat-export-btn"
                  onClick={() => downloadAsCsv(msg.content, msg.id)}
                  title="匯出表格為 CSV"
                  aria-label="匯出表格為 CSV"
                >
                  <DownloadCsvIcon />
                </button>
              )}
            </div>
          ))}

          {error && (
            <div className="chat-error">
              ⚠ {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="chat-input-area">
          {/* File badge */}
          {(uploadedFile || processingFile) && (
            <div className="chat-file-badge">
              {processingFile ? (
                <>
                  <span className="file-badge-spinner" />
                  <span className="file-badge-name">處理中…</span>
                </>
              ) : (
                <>
                  {uploadedFile!.type === 'image' ? <ImageFileIcon /> : <PdfFileIcon />}
                  <span className="file-badge-name">{uploadedFile!.name}</span>
                  <button
                    className="file-badge-remove"
                    onClick={() => setUploadedFile(null)}
                    aria-label="移除檔案"
                  >
                    <XIcon />
                  </button>
                </>
              )}
            </div>
          )}

          <div className={`chat-input-box${!hasApiKey ? ' chat-input-box--disabled' : ''}`}>
            <button
              className="input-action-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={!hasApiKey || loading || processingFile}
              aria-label="上傳圖片或 PDF"
              title="上傳圖片或 PDF"
            >
              <PaperclipIcon />
            </button>

            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                !hasApiKey ? '請先設定 API Key' :
                uploadedFile ? '根據已載入文件提問… (Enter 送出，Shift+Enter 換行)' :
                '輸入訊息… (Enter 送出，Shift+Enter 換行)'
              }
              disabled={!hasApiKey || loading}
              rows={1}
            />

            <button
              className={`input-send-btn${loading ? ' input-send-btn--loading' : ''}`}
              onClick={handleSend}
              disabled={!hasApiKey || !input.trim() || loading}
              aria-label="送出"
            >
              <SendIcon />
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
