import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Epub from 'epubjs'
import { useAuth, reportTokens } from './AuthContext'
import AuthUserIcon from './AuthUserIcon'
import TokenToast from './TokenToast'
import './Ebook.css'

// Defensive import for Vite ESM compatibility
const ePub: (src: ArrayBuffer, options?: any) => any =
  (typeof (Epub as any) === 'function' ? Epub : (Epub as any).default) as any

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface Message { id: string; role: 'user' | 'assistant'; content: string }

type LlmProvider = 'openai' | 'gemini' | 'ollama'
interface LlmConfig {
  openai: { apiKey: string }
  gemini: { apiKey: string }
  ollama: { url: string; model: string }
}
const LLM_INIT: LlmConfig = {
  openai: { apiKey: '' },
  gemini: { apiKey: '' },
  ollama: { url: 'http://localhost:11434', model: 'llama3' },
}

type UploadPhase = 'idle' | 'parsing' | 'confirming' | 'ready'

interface EpubChunk { id: string; title: string; text: string }
interface EpubBook {
  title: string
  author: string
  chapters: EpubChunk[]
  totalChars: number
  totalWords: number
  uniqueWords: number
}

/* ─────────────────────────────────────────────
   Pure helpers
   ───────────────────────────────────────────── */

function findTocTitle(nav: any, spineHref: string): string {
  const file = (spineHref || '').split('/').pop()?.split('#')[0] || ''
  function search(items: any[]): string {
    for (const item of (items || [])) {
      const iFile = (item.href || '').split('/').pop()?.split('#')[0] || ''
      if (iFile && file && iFile === file) return (item.label || '').trim()
      const found = search(item.subitems || [])
      if (found) return found
    }
    return ''
  }
  return search(nav?.toc || [])
}

function buildStats(title: string, author: string, chapters: EpubChunk[]): EpubBook {
  const allText = chapters.map(c => c.text).join(' ')
  const totalChars = allText.length
  const words = allText.split(/\s+/).filter(w => w.length > 0)
  const totalWords = words.length
  const cleaned = words.map(w => w.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '')).filter(Boolean)
  const uniqueWords = new Set(cleaned).size
  return { title, author, chapters, totalChars, totalWords, uniqueWords }
}

const FULL_TEXT_THRESHOLD = 40_000

function scoreChunk(question: string, text: string): number {
  const terms = question.toLowerCase()
    .split(/[\s，。！？、；：""''【】（）\[\]]+/)
    .filter(t => t.length >= 2)
  if (!terms.length) return 0
  const lower = text.toLowerCase()
  const len = text.length || 1
  return terms.reduce((score, term) => {
    let count = 0, pos = 0
    while ((pos = lower.indexOf(term, pos)) !== -1) { count++; pos += term.length }
    return score + (count / len * 1000) * Math.log(term.length + 1)
  }, 0)
}

function selectContext(question: string, chapters: EpubChunk[]): { context: string; usedChunks: string[] } {
  const totalChars = chapters.reduce((s, c) => s + c.text.length, 0)
  if (totalChars < FULL_TEXT_THRESHOLD) {
    return {
      context: chapters.map(c => `【${c.title}】\n${c.text}`).join('\n\n---\n\n'),
      usedChunks: chapters.map(c => c.title),
    }
  }
  const scored = chapters
    .map(c => ({ c, score: scoreChunk(question, c.text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  return {
    context: scored.map(s => `【${s.c.title}】\n${s.c.text.slice(0, 10_000)}`).join('\n\n---\n\n'),
    usedChunks: scored.map(s => s.c.title),
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString('zh-TW')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function markdownToHtml(md: string): string {
  let html = escapeHtml(md)
  // headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  // bold / italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
  // unordered list
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
  // ordered list
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
  // horizontal rule
  html = html.replace(/^---$/gm, '<hr>')
  // paragraphs: blank-line-separated blocks not already tagged
  html = html.split(/\n{2,}/).map(block => {
    if (/^<(h[1-6]|ul|ol|li|blockquote|hr)/.test(block.trim())) return block
    return `<p>${block.replace(/\n/g, '<br>')}</p>`
  }).join('\n')
  return html
}

/* ─────────────────────────────────────────────
   Icons
   ───────────────────────────────────────────── */

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

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

function NewChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

function ChevronsLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
    </svg>
  )
}

function ChevronsRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
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

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

function PrinterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
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

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ThermometerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

interface Props { onBack: () => void }

export default function Ebook({ onBack }: Props) {
  const { user } = useAuth()
  // ── Theme & layout
  const [isDark, setIsDark] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ── LLM settings (same as Chat.tsx)
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('openai')
  const [llmSaved, setLlmSaved] = useState<LlmConfig>(LLM_INIT)
  const [llmDraft, setLlmDraft] = useState<LlmConfig>(LLM_INIT)
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [temperature, setTemperature] = useState(0.7)

  // ── Conversation
  const [messages, setMessages] = useState<Message[]>([])
  const [convProvider, setConvProvider] = useState<LlmProvider | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const [lastUsedChunks, setLastUsedChunks] = useState<string[]>([])

  // ── EPUB state
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [epubBook, setEpubBook] = useState<EpubBook | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Summary
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryChapterIdx, setSummaryChapterIdx] = useState(-1)
  const [summaryOpen, setSummaryOpen] = useState(true)

  // ── Token toast
  const [tokenToast, setTokenToast] = useState<{ provider: string; tokens: number } | null>(null)

  // ── Suggested questions
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)

  // ── Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const ebookInputRef = useRef<HTMLInputElement>(null)

  // ── Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── LLM helpers ── */

  function isLlmConfigured() {
    if (llmProvider === 'openai') return !!llmSaved.openai.apiKey
    if (llmProvider === 'gemini') return !!llmSaved.gemini.apiKey
    return !!(llmSaved.ollama.url && llmSaved.ollama.model)
  }

  function getLlmEndpointAndKey() {
    const endpoint = llmProvider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    const model = llmProvider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.0-flash'
    const apiKey = llmProvider === 'openai' ? llmSaved.openai.apiKey : llmSaved.gemini.apiKey
    return { endpoint, model, apiKey }
  }

  function handleSaveLlm() {
    setLlmSaved(prev => ({ ...prev, [llmProvider]: { ...llmDraft[llmProvider] } }))
    setError(null)
    if (llmProvider === 'ollama') {
      setOllamaStatus('checking')
      fetch(`${llmDraft.ollama.url}/api/version`, { signal: AbortSignal.timeout(5000) })
        .then(r => setOllamaStatus(r.ok ? 'ok' : 'error'))
        .catch(() => setOllamaStatus('error'))
    }
  }

  function handleClearLlm() {
    const empty = llmProvider === 'ollama'
      ? { url: 'http://localhost:11434', model: 'llama3' } as { url: string; model: string }
      : { apiKey: '' } as { apiKey: string }
    setLlmSaved(prev => ({ ...prev, [llmProvider]: empty }))
    setLlmDraft(prev => ({ ...prev, [llmProvider]: empty }))
    if (llmProvider === 'ollama') setOllamaStatus('idle')
    setMessages([])
    setConvProvider(null)
    setError(null)
  }

  async function handleTestOllama() {
    setOllamaStatus('checking')
    try {
      const res = await fetch(`${llmDraft.ollama.url}/api/version`, { signal: AbortSignal.timeout(5000) })
      setOllamaStatus(res.ok ? 'ok' : 'error')
    } catch { setOllamaStatus('error') }
  }

  function handleNewConversation() {
    setMessages([])
    setConvProvider(null)
    setError(null)
    setLastUsedChunks([])
    setSuggestedQuestions([])
  }

  /* ── EPUB parsing ── */

  async function parseEpub(file: File): Promise<EpubBook> {
    const buffer = await file.arrayBuffer()
    const book = ePub(buffer)
    await book.ready

    const meta = await book.loaded.metadata
    const title = (meta.title as string) || file.name.replace(/\.epub$/i, '')
    const author = (meta.creator as string) || '未知'

    const nav = await book.loaded.navigation
    const spine = book.spine as any

    if (!spine?.items?.length) {
      book.destroy()
      throw new Error('無法讀取章節，此 EPUB 可能格式不符或含 DRM 保護。')
    }

    const diag: string[] = []
    diag.push(`spine items: ${spine.items.length}`)

    const chapters: EpubChunk[] = []
    for (let idx = 0; idx < spine.items.length; idx++) {
      const item = spine.items[idx]
      const itemTag = `[${idx}] idref=${item.idref} href=${item.href}`
      try {
        // Try multiple lookup strategies: idref → href → numeric index
        const section =
          book.section(item.idref) ??
          book.section(item.href) ??
          (book.spine?.get ? (book.spine.get(idx) ?? book.spine.get(item.href) ?? book.spine.get(item.idref)) : null)
        if (!section) { diag.push(`${itemTag} → section=null (all lookups failed)`); continue }

        let text = ''
        let attempt1Note = ''
        let attempt2Note = ''

        // Attempt 1: section.load() — may return Document or something else
        try {
          const loaded = await section.load(book.load.bind(book)) as any
          const loadedType = loaded === null ? 'null' : typeof loaded
          const hasDocEl = !!loaded?.documentElement
          const hasBody  = !!loaded?.body
          const sectionDoc = (section as any).document
          attempt1Note = `loaded type=${loadedType} hasDocEl=${hasDocEl} hasBody=${hasBody} sectionDoc=${sectionDoc != null}`

          const docObj: Document | undefined =
            loaded?.documentElement ? loaded :
            loaded?.body ? loaded :
            sectionDoc ?? undefined

          if (docObj) {
            const bodyEl = docObj.body ?? docObj.documentElement
            text = (bodyEl?.textContent ?? '').replace(/\s+/g, ' ').trim()
            attempt1Note += ` bodyEl=${!!bodyEl} textLen=${text.length}`
          } else {
            attempt1Note += ` docObj=undefined`
          }
        } catch (e1) {
          attempt1Note = `threw: ${e1 instanceof Error ? e1.message : String(e1)}`
        }

        // Attempt 2: book.load() returns raw string → parse with DOMParser
        if (!text) {
          try {
            const href = (section as any).href || item.href
            const raw = await book.load(href) as any
            const rawType = raw === null ? 'null' : typeof raw
            const rawLen  = typeof raw === 'string' ? raw.length : (raw?.byteLength ?? '?')
            attempt2Note = `book.load type=${rawType} len=${rawLen}`

            if (typeof raw === 'string' && raw.length > 0) {
              const parsed = new DOMParser().parseFromString(raw, 'text/html')
              text = (parsed.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
              attempt2Note += ` parsed textLen=${text.length}`
            } else if (raw?.documentElement || raw?.body) {
              const bodyEl = (raw as Document).body ?? (raw as Document).documentElement
              text = (bodyEl?.textContent ?? '').replace(/\s+/g, ' ').trim()
              attempt2Note += ` docPath textLen=${text.length}`
            } else {
              attempt2Note += ` unrecognised raw value`
            }
          } catch (e2) {
            attempt2Note = `threw: ${e2 instanceof Error ? e2.message : String(e2)}`
          }
        }

        section.unload?.()

        const shortText = text.length < 50 ? `(too short: ${text.length})` : `(ok: ${text.length})`
        diag.push(`${itemTag} | a1:[${attempt1Note}] | a2:[${attempt2Note || 'skipped'}] | text:${shortText}`)

        if (text.length < 50) continue
        const chTitle = findTocTitle(nav, item.href) || item.idref
        chapters.push({ id: item.idref, title: chTitle, text })
      } catch (eOuter) {
        diag.push(`${itemTag} → outer error: ${eOuter instanceof Error ? eOuter.message : String(eOuter)}`)
      }
    }

    book.destroy()

    if (chapters.length === 0) {
      const report = diag.join('\n')
      throw new Error(`未能提取任何章節文字。\n\n── 診斷報告 ──\n${report}`)
    }

    return buildStats(title, author, chapters)
  }

  async function handleEpubSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await startParsing(file)
  }

  async function startParsing(file: File) {
    setUploadPhase('parsing')
    setParseError(null)
    try {
      const book = await parseEpub(file)
      setEpubBook(book)
      setUploadPhase('confirming')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '解析 EPUB 時發生未知錯誤。'
      setParseError(msg)
      setUploadPhase('idle')
    }
  }

  function handleConfirmBook() {
    setUploadPhase('ready')
    if (isLlmConfigured() && epubBook) {
      generateSuggestedQuestions('initial', null)
    }
  }

  function handleDeleteBook() {
    setEpubBook(null)
    setUploadPhase('idle')
    setParseError(null)
    setMessages([])
    setConvProvider(null)
    setError(null)
    setSummaries({})
    setSummaryLoading(false)
    setSummaryChapterIdx(-1)
    setSuggestedQuestions([])
    setLastUsedChunks([])
  }

  /* ── Drag & drop ── */

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave() { setIsDragOver(false) }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.epub')) {
      startParsing(file)
    }
  }

  /* ── Send message ── */

  async function handleSend() {
    if (!isLlmConfigured() || !input.trim() || loading || !epubBook) return
    if (convProvider === null) setConvProvider(llmProvider)
    setError(null)

    const question = input.trim()
    const { context, usedChunks } = selectContext(question, epubBook.chapters)
    setLastUsedChunks(usedChunks)

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: question }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    const assistantId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    const systemContent = `以下是電子書「${epubBook.title}」的相關章節內容，請根據此內容回答使用者的問題：\n\n${context}`
    let finalContent = ''
    let lastTokenCount = 0

    try {
      if (llmProvider === 'openai' || llmProvider === 'gemini') {
        const { endpoint, model, apiKey } = getLlmEndpointAndKey()
        const builtMessages: any[] = [
          { role: 'system', content: systemContent },
          ...updatedMessages.map(m => ({ role: m.role, content: m.content })),
        ]

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages: builtMessages, stream: true, temperature, stream_options: { include_usage: true } }),
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
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content ?? ''
              accumulated += delta
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m))
              const usageTokens = parsed.usage?.total_tokens ?? 0
              if (usageTokens > 0) lastTokenCount = usageTokens
            } catch { /* skip malformed */ }
          }
        }
        finalContent = accumulated
      } else {
        // Ollama NDJSON
        const ollamaMessages: any[] = [
          { role: 'system', content: systemContent },
          ...updatedMessages.map(m => ({ role: m.role, content: m.content })),
        ]
        const response = await fetch(`${llmSaved.ollama.url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: llmSaved.ollama.model,
            messages: ollamaMessages,
            stream: true,
            options: { temperature },
          }),
        })
        if (!response.ok) throw new Error(`Ollama 錯誤：HTTP ${response.status}`)
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const obj = JSON.parse(line)
              const delta = obj.message?.content ?? ''
              if (delta) {
                accumulated += delta
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m))
              }
              if (obj.done) {
                const ollamaTokens = (obj.prompt_eval_count ?? 0) + (obj.eval_count ?? 0)
                if (ollamaTokens > 0) lastTokenCount = ollamaTokens
              }
            } catch { /* ignore */ }
          }
        }
        finalContent = accumulated
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '發生未知錯誤'
      setError(msg)
      setMessages(prev => prev.filter(m => m.id !== assistantId))
    } finally {
      setLoading(false)
      if (lastTokenCount > 0) {
        reportTokens(user, llmProvider, lastTokenCount)
        setTokenToast({ provider: llmProvider, tokens: lastTokenCount })
      }
    }

    // Generate new suggested questions based on assistant reply
    if (finalContent) {
      generateSuggestedQuestions('followup', finalContent)
    }
  }

  /* ── Suggested questions (non-streaming, background) ── */

  async function generateSuggestedQuestions(mode: 'initial' | 'followup', context: string | null) {
    if (!isLlmConfigured() || questionsLoading || !epubBook) return
    setQuestionsLoading(true)

    const prompt = mode === 'initial'
      ? `這是一本書「${epubBook.title}」，作者「${epubBook.author}」。\n第一章節內容：${epubBook.chapters[0]?.text.slice(0, 800) ?? ''}\n請產生 4 個讀者可能想問的具體問題，直接列出問題本身（不含編號或任何說明），每行一個。`
      : `根據以下 AI 回覆，產生 4 個讀者可能延伸追問的具體問題，直接列出問題本身（不含編號或任何說明），每行一個。\nAI 回覆：${(context || '').slice(0, 1200)}`

    try {
      let raw = ''
      if (llmProvider === 'openai' || llmProvider === 'gemini') {
        const { endpoint, model, apiKey } = getLlmEndpointAndKey()
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.9, stream: false }),
        })
        const data = await res.json()
        raw = data.choices?.[0]?.message?.content ?? ''
      } else {
        const res = await fetch(`${llmSaved.ollama.url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: llmSaved.ollama.model,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            options: { temperature: 0.9 },
          }),
        })
        const data = await res.json()
        raw = data.message?.content ?? ''
      }
      const questions = (raw as string).split('\n')
        .map((l: string) => l.trim().replace(/^[\d\.\-\*\s、。]+/, '').trim())
        .filter((l: string) => l.length > 4)
        .slice(0, 4)
      setSuggestedQuestions(questions)
    } catch { /* silently fail — non-critical */ }
    finally { setQuestionsLoading(false) }
  }

  /* ── Streaming summary for one chapter ── */

  async function streamChapterSummary(ch: EpubChunk, chapterIdx: number): Promise<void> {
    const prompt = `請為以下章節「${ch.title}」提供一段 150 字以內的重點摘要（繁體中文）：\n\n${ch.text.slice(0, 3000)}`
    const chId = ch.id
    setSummaries(prev => ({ ...prev, [chId]: '' }))

    let lastSummaryTokenCount = 0
    try {
      if (llmProvider === 'openai' || llmProvider === 'gemini') {
        const { endpoint, model, apiKey } = getLlmEndpointAndKey()
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
            temperature,
            stream_options: { include_usage: true },
          }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content ?? ''
              accumulated += delta
              setSummaries(prev => ({ ...prev, [chId]: accumulated }))
              const usageTokens = parsed.usage?.total_tokens ?? 0
              if (usageTokens > 0) lastSummaryTokenCount += usageTokens
            } catch { /* skip */ }
          }
        }
      } else {
        const response = await fetch(`${llmSaved.ollama.url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: llmSaved.ollama.model,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
            options: { temperature },
          }),
        })
        if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`)
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const obj = JSON.parse(line)
              const delta = obj.message?.content ?? ''
              if (delta) {
                accumulated += delta
                setSummaries(prev => ({ ...prev, [chId]: accumulated }))
              }
              if (obj.done) {
                const ollamaTokens = (obj.prompt_eval_count ?? 0) + (obj.eval_count ?? 0)
                if (ollamaTokens > 0) lastSummaryTokenCount += ollamaTokens
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch {
      setSummaries(prev => ({ ...prev, [chId]: '（生成失敗）' }))
    }
    if (lastSummaryTokenCount > 0) {
      reportTokens(user, llmProvider, lastSummaryTokenCount)
      setTokenToast({ provider: llmProvider, tokens: lastSummaryTokenCount })
    }

    void chapterIdx // suppress unused warning
  }

  async function handleGenerateSummaries() {
    if (!epubBook || summaryLoading || !isLlmConfigured()) return
    setSummaryLoading(true)
    setSummaries({})
    setSummaryOpen(true)

    for (let i = 0; i < epubBook.chapters.length; i++) {
      setSummaryChapterIdx(i)
      await streamChapterSummary(epubBook.chapters[i], i)
    }

    setSummaryLoading(false)
    setSummaryChapterIdx(-1)
  }

  /* ── PDF export ── */

  function handlePrintQA() {
    if (!messages.length) return
    const title = epubBook ? epubBook.title : '電子書問答'
    const rows = messages.map(m => {
      const role = m.role === 'user' ? '你' : 'AI'
      const content = markdownToHtml(m.content)
      return `<div class="msg ${m.role}"><div class="role">${role}</div><div class="content">${content}</div></div>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)} — 問答紀錄</title>
<style>
body{font-family:'Noto Sans TC',sans-serif;max-width:720px;margin:40px auto;color:#1a1a1a;font-size:14px;line-height:1.7}
h1{font-size:20px;margin-bottom:6px}
.date{color:#888;font-size:12px;margin-bottom:24px}
.msg{margin:14px 0;display:flex;gap:12px;align-items:flex-start}
.role{font-weight:700;min-width:28px;color:#666;flex-shrink:0;padding-top:2px}
.content{flex:1;background:#f5f5f5;padding:10px 14px;border-radius:8px;word-break:break-word}
.user{flex-direction:row-reverse}.user .role{color:#9a6f30}
.user .content{background:#fdf6e8}
hr{border:none;border-top:1px solid #eee;margin:24px 0}
@media print{body{margin:20px}}
</style></head><body>
<h1>${escapeHtml(title)} — 問答紀錄</h1>
<p class="date">${new Date().toLocaleString('zh-TW')}</p>
<hr/>${rows}</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  function handlePrintSummary() {
    if (!epubBook) return
    const title = epubBook.title
    const rows = epubBook.chapters
      .filter(ch => summaries[ch.id])
      .map(ch => `<div class="chapter"><h2>${escapeHtml(ch.title)}</h2><p>${escapeHtml(summaries[ch.id])}</p></div>`)
      .join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)} — 章節摘要</title>
<style>
body{font-family:'Noto Sans TC',sans-serif;max-width:720px;margin:40px auto;color:#1a1a1a;font-size:14px;line-height:1.7}
h1{font-size:20px;margin-bottom:6px}
.date{color:#888;font-size:12px;margin-bottom:24px}
.chapter{margin:20px 0;padding:16px;background:#f9f9f9;border-radius:8px;border-left:3px solid #9a6f30}
.chapter h2{font-size:15px;font-weight:700;color:#0e1f3d;margin-bottom:8px}
.chapter p{color:#333}
hr{border:none;border-top:1px solid #eee;margin:24px 0}
@media print{body{margin:20px}}
</style></head><body>
<h1>${escapeHtml(title)} — 章節摘要</h1>
<p class="date">${new Date().toLocaleString('zh-TW')}</p>
<hr/>${rows}</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  /* ── Input handlers ── */

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  /* ── Computed ── */

  const hasSummaries = Object.keys(summaries).length > 0
  const summaryDone = !summaryLoading && hasSummaries

  /* ── Render ── */

  return (
    <>
    <div className={`eb-root${isDark ? '' : ' light'}`}>

      {/* Hidden file input */}
      <input
        ref={ebookInputRef}
        type="file"
        accept=".epub"
        style={{ display: 'none' }}
        onChange={handleEpubSelect}
      />

      {/* ── Sidebar ── */}
      <aside className={`eb-sidebar${sidebarOpen ? '' : ' eb-sidebar--collapsed'}`}>
        <div className="sidebar-top">
          {sidebarOpen && <span className="sidebar-brand">設定</span>}
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
            {/* Provider tabs */}
            <div className="eb-provider-tabs">
              {(['openai', 'gemini', 'ollama'] as LlmProvider[]).map(p => (
                <button
                  key={p}
                  className={`eb-provider-tab${llmProvider === p ? ' active' : ''}`}
                  onClick={() => setLlmProvider(p)}
                >
                  {p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : 'Ollama'}
                </button>
              ))}
            </div>

            {/* OpenAI / Gemini */}
            {(llmProvider === 'openai' || llmProvider === 'gemini') && (
              <>
                <div className="sidebar-section-label"><KeyIcon /><span>API Key</span></div>
                <input
                  className="sidebar-input"
                  type="password"
                  value={(llmDraft[llmProvider] as { apiKey: string }).apiKey}
                  onChange={e => setLlmDraft(prev => ({ ...prev, [llmProvider]: { apiKey: e.target.value } }))}
                  onKeyDown={e => e.key === 'Enter' && handleSaveLlm()}
                  placeholder={llmProvider === 'openai' ? 'sk-...' : 'AIza...'}
                  autoComplete="off"
                />
                <div className="sidebar-key-actions">
                  <button className="sidebar-btn sidebar-btn--primary" onClick={handleSaveLlm}
                    disabled={!(llmDraft[llmProvider] as { apiKey: string }).apiKey.trim()}>儲存</button>
                  {(llmSaved[llmProvider] as { apiKey: string }).apiKey && (
                    <button className="sidebar-btn sidebar-btn--danger" onClick={handleClearLlm}>清除</button>
                  )}
                </div>
                <div className={`sidebar-key-status${isLlmConfigured() ? ' sidebar-key-status--ok' : ''}`}>
                  <span className="status-dot" />
                  <span>{isLlmConfigured() ? 'API Key 已設定' : '尚未設定 API Key'}</span>
                </div>
                <p className="sidebar-hint">Key 僅存於記憶體，關閉頁面後自動清除。</p>
              </>
            )}

            {/* Ollama */}
            {llmProvider === 'ollama' && (
              <>
                <div className="sidebar-section-label"><span>URL</span></div>
                <input
                  className="sidebar-input"
                  value={llmDraft.ollama.url}
                  onChange={e => setLlmDraft(prev => ({ ...prev, ollama: { ...prev.ollama, url: e.target.value } }))}
                  placeholder="http://localhost:11434"
                />
                <div className="sidebar-section-label" style={{ marginTop: '8px' }}><span>Model</span></div>
                <input
                  className="sidebar-input"
                  value={llmDraft.ollama.model}
                  onChange={e => setLlmDraft(prev => ({ ...prev, ollama: { ...prev.ollama, model: e.target.value } }))}
                  placeholder="llama3"
                />
                <div className="sidebar-key-actions">
                  <button className="sidebar-btn sidebar-btn--primary" onClick={handleSaveLlm}>儲存</button>
                  <button className="sidebar-btn" onClick={handleTestOllama}
                    disabled={ollamaStatus === 'checking'} style={{ border: '1px solid var(--border)' }}>
                    {ollamaStatus === 'checking' ? '測試中...' : '測試連線'}
                  </button>
                </div>
                {ollamaStatus === 'ok' && (
                  <div className="sidebar-key-status sidebar-key-status--ok">
                    <span className="status-dot" /><span>連線成功</span>
                  </div>
                )}
                {ollamaStatus === 'error' && (
                  <p className="sidebar-hint" style={{ color: 'var(--danger)' }}>
                    ⚠ 無法連線，請確認 URL 是否正確。
                  </p>
                )}
                <p className="sidebar-hint">設定僅存於記憶體，關閉頁面後自動清除。</p>
              </>
            )}

            {/* Temperature */}
            <div className="sidebar-section-label" style={{ marginTop: '4px' }}>
              <ThermometerIcon /><span>Temperature</span>
            </div>
            <div className="eb-temperature-section">
              <div className="eb-temperature-row">
                <input
                  type="range"
                  className="eb-temperature-slider"
                  min="0" max="2" step="0.1"
                  value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                />
                <span className="eb-temperature-value">{temperature.toFixed(1)}</span>
              </div>
              <p className="sidebar-hint">0 = 確定性　2 = 創意性</p>
            </div>

            {/* Book section (shown after epub loaded) */}
            {epubBook && uploadPhase === 'ready' && (
              <>
                <div className="eb-sidebar-divider" />

                <div className="sidebar-section-label">
                  <BookIcon /><span>書本</span>
                </div>
                <div className="eb-sidebar-book-row">
                  <span className="eb-sidebar-book-title" title={epubBook.title}>{epubBook.title}</span>
                  <span className="eb-sidebar-book-badge">{epubBook.chapters.length} 章</span>
                  <button className="eb-sidebar-remove-btn" onClick={handleDeleteBook} title="移除書本">
                    <XIcon />
                  </button>
                </div>

                <div className="sidebar-section-label" style={{ marginTop: '4px' }}>
                  <span>章節列表</span>
                </div>
                <div className="eb-chapter-list">
                  {epubBook.chapters.map((ch, i) => (
                    <button
                      key={ch.id}
                      className="eb-chapter-item"
                      onClick={() => setInput(`請介紹第 ${i + 1} 章「${ch.title}」`)}
                      title={ch.title}
                    >
                      {i + 1}. {ch.title}
                    </button>
                  ))}
                </div>

                <button
                  className="eb-generate-btn"
                  onClick={handleGenerateSummaries}
                  disabled={summaryLoading || !isLlmConfigured()}
                >
                  {summaryLoading ? (
                    <>
                      <span className="eb-summary-spinner" />
                      {summaryChapterIdx >= 0 ? `第 ${summaryChapterIdx + 1} 章…` : '生成中…'}
                    </>
                  ) : '一鍵生成章節摘要'}
                </button>
              </>
            )}
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <div className="eb-main">

        {/* Topbar */}
        <div className="eb-topbar">
          <div className="eb-topbar-title">
            <BookIcon />
            <span>電子書問答</span>
            <span className="eb-provider-badge">
              {(convProvider ?? llmProvider) === 'openai' ? 'OpenAI'
                : (convProvider ?? llmProvider) === 'gemini' ? 'Gemini' : 'Ollama'}
            </span>
          </div>
          <div className="eb-topbar-actions">
            <button className="eb-ctrl-btn" onClick={handleNewConversation}
              aria-label="新對話" title="新對話">
              <NewChatIcon />
            </button>
            {messages.length > 0 && (
              <button className="eb-ctrl-btn" onClick={handlePrintQA}
                aria-label="下載問答 PDF" title="下載問答 PDF">
                <PrinterIcon />
              </button>
            )}
            <button className="eb-ctrl-btn" onClick={() => setIsDark(!isDark)}
              aria-label={isDark ? '切換亮色' : '切換深色'}>
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="eb-ctrl-btn" onClick={onBack} aria-label="返回首頁">
              <HomeIcon />
            </button>
            <AuthUserIcon />
          </div>
        </div>

        {/* ── Upload phases ── */}

        {uploadPhase === 'idle' && (
          <div className="eb-dropzone-wrap">
            {parseError && (
              <div className="eb-parse-error" style={{ marginBottom: '16px', width: '100%', maxWidth: '640px', whiteSpace: 'pre-wrap', fontFamily: "'DM Mono', monospace", fontSize: '12px', lineHeight: '1.7' }}>
                ⚠ {parseError}
              </div>
            )}
            <div
              className={`eb-dropzone${isDragOver ? ' eb-dropzone--dragover' : ''}`}
              onClick={() => ebookInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && ebookInputRef.current?.click()}
              aria-label="上傳 EPUB 檔案"
            >
              <div className="eb-dropzone-icon"><BookIcon /></div>
              <p className="eb-dropzone-text">拖曳或點擊上傳 EPUB 檔案</p>
              <p className="eb-dropzone-hint">支援 .epub 格式　上傳後自動分析書本內容</p>
            </div>
          </div>
        )}

        {uploadPhase === 'parsing' && (
          <div className="eb-parsing-overlay">
            <div className="eb-parsing-spinner" />
            <p className="eb-parsing-text">正在解析 EPUB…</p>
          </div>
        )}

        {uploadPhase === 'confirming' && epubBook && (
          <div className="eb-book-info-wrap">
            <div className="eb-book-info-card">
              {/* Header */}
              <div className="eb-book-header">
                <div className="eb-book-title">{epubBook.title}</div>
                {epubBook.author !== '未知' && (
                  <div className="eb-book-author">{epubBook.author}</div>
                )}
              </div>

              {/* Stats grid */}
              <div className="eb-stat-grid">
                <div className="eb-stat-item">
                  <span className="eb-stat-label">章節數</span>
                  <span className="eb-stat-value">{epubBook.chapters.length}</span>
                </div>
                <div className="eb-stat-item">
                  <span className="eb-stat-label">總字數</span>
                  <span className="eb-stat-value">{formatNumber(epubBook.totalChars)}</span>
                  <span className="eb-stat-sub">字元</span>
                </div>
                <div className="eb-stat-item">
                  <span className="eb-stat-label">預估閱讀時間</span>
                  <span className="eb-stat-value">{Math.ceil(epubBook.totalWords / 200)}</span>
                  <span className="eb-stat-sub">分鐘（200 字/分）</span>
                </div>
                <div className="eb-stat-item">
                  <span className="eb-stat-label">詞彙豐富度</span>
                  <span className="eb-stat-value">
                    {epubBook.totalWords > 0
                      ? Math.round((epubBook.uniqueWords / epubBook.totalWords) * 100) + '%'
                      : '—'}
                  </span>
                  <span className="eb-stat-sub">獨特詞彙比例</span>
                </div>
              </div>

              {/* Chapter bar chart */}
              {epubBook.chapters.length > 0 && (
                <div>
                  <div className="eb-chart-title">章節長度分佈</div>
                  <div className="eb-chart-bars">
                    {(() => {
                      const maxLen = Math.max(...epubBook.chapters.map(c => c.text.length), 1)
                      return epubBook.chapters.map((ch, i) => (
                        <div key={ch.id} className="eb-chart-row">
                          <span className="eb-chart-label" title={ch.title}>
                            {i + 1}. {ch.title}
                          </span>
                          <div className="eb-chart-bar-track">
                            <div
                              className="eb-chart-bar-fill"
                              style={{ width: `${(ch.text.length / maxLen) * 100}%` }}
                            />
                          </div>
                          <span className="eb-chart-bar-len">
                            {ch.text.length > 999
                              ? (ch.text.length / 1000).toFixed(1) + 'k'
                              : ch.text.length}
                          </span>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}

              {/* Processing note */}
              {epubBook.totalChars >= FULL_TEXT_THRESHOLD && (
                <p className="sidebar-hint">
                  此書內容較長（{formatNumber(epubBook.totalChars)} 字元），問答時將自動選取最相關章節作為上下文。
                </p>
              )}
              {epubBook.totalChars < FULL_TEXT_THRESHOLD && (
                <p className="sidebar-hint">
                  此書內容適中，問答時將使用完整書本內容作為上下文。
                </p>
              )}

              {/* Actions */}
              <div className="eb-book-actions">
                <button className="eb-book-delete-btn" onClick={handleDeleteBook}>刪除檔案</button>
                <button className="eb-book-confirm-btn" onClick={handleConfirmBook}>確定，開始問答</button>
              </div>
            </div>
          </div>
        )}

        {uploadPhase === 'ready' && (
          <>
            {/* Summary panel */}
            {hasSummaries && (
              <div className={`eb-summary-panel${summaryOpen ? '' : ' eb-summary-panel--collapsed'}`}>
                <div className="eb-summary-header">
                  <span className="eb-summary-header-title">章節摘要</span>
                  {summaryDone && (
                    <button className="eb-summary-header-btn" onClick={handlePrintSummary} title="下載摘要 PDF">
                      <PrinterIcon />
                    </button>
                  )}
                  <button className="eb-summary-header-btn" onClick={() => setSummaryOpen(!summaryOpen)}>
                    {summaryOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  </button>
                </div>
                {summaryOpen && (
                  <div className="eb-summary-body">
                    {epubBook?.chapters.map((ch, i) => (
                      <div key={ch.id} className="eb-summary-item">
                        <div className="eb-summary-chapter-title">
                          <span>{i + 1}. {ch.title}</span>
                          {summaryChapterIdx === i && <span className="eb-summary-spinner" />}
                        </div>
                        {summaries[ch.id]
                          ? <div className="eb-summary-text">{summaries[ch.id]}</div>
                          : summaryChapterIdx > i || summaryChapterIdx === -1
                            ? null
                            : <span className="eb-summary-pending">等待中…</span>
                        }
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            <div className="eb-messages">
              {messages.length === 0 && (
                <div className="eb-empty">
                  <BookIcon />
                  <p>「{epubBook?.title}」已載入，共 {epubBook?.chapters.length} 章</p>
                  <p style={{ fontSize: '13px' }}>
                    {isLlmConfigured()
                      ? '輸入問題或點擊下方建議問題開始問答'
                      : '請先在側邊欄設定 LLM API Key'}
                  </p>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1
                const showChunkInfo = isLastAssistant && msg.content && lastUsedChunks.length > 0
                return (
                  <div key={msg.id} className={`eb-msg eb-msg--${msg.role}`}>
                      <div className="eb-msg-avatar">
                        {msg.role === 'assistant' ? <BookIcon /> : <UserIcon />}
                      </div>
                      <div className="eb-msg-body">
                        <div className="eb-msg-bubble">
                          {msg.content
                            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                            : <span className="eb-typing"><span /><span /><span /></span>
                          }
                        </div>
                        {showChunkInfo && (
                          <div className="eb-chunk-info">
                            📖 {lastUsedChunks.length === epubBook?.chapters.length
                              ? '使用完整書本內容'
                              : `參考章節：${lastUsedChunks.slice(0, 3).join('、')}`}
                          </div>
                        )}
                      </div>
                  </div>
                )
              })}

              {error && <div className="eb-error">⚠ {error}</div>}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="eb-input-area">
              {/* Suggested questions */}
              {suggestedQuestions.length > 0 && !loading && (
                <div className="eb-suggestions">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      className="eb-suggestion-chip"
                      onClick={() => setInput(q)}
                      disabled={loading}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div className={`eb-input-box${!isLlmConfigured() ? ' eb-input-box--disabled' : ''}`}>
                <textarea
                  ref={textareaRef}
                  className="eb-textarea"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  placeholder={
                    !isLlmConfigured()
                      ? (llmProvider === 'ollama' ? '請先設定 Ollama' : '請先設定 API Key')
                      : '根據書本內容提問… (Enter 送出，Shift+Enter 換行)'
                  }
                  disabled={!isLlmConfigured() || loading}
                  rows={1}
                />
                <button
                  className={`input-send-btn${loading ? ' input-send-btn--loading' : ''}`}
                  onClick={handleSend}
                  disabled={!isLlmConfigured() || !input.trim() || loading}
                  aria-label="送出"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    {tokenToast && (
      <TokenToast provider={tokenToast.provider} tokens={tokenToast.tokens} onDone={() => setTokenToast(null)} />
    )}
    </>
  )
}
