import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as pdfjs from 'pdfjs-dist'
import { useAuth, reportTokens } from './AuthContext'
import AuthUserIcon from './AuthUserIcon'
import TokenToast from './TokenToast'
import './PaperDoc.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

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

interface Paper {
  id: string
  title: string
  authors: string[]
  year: number | null
  abstract: string
  pdfUrl?: string
  pageUrl: string
  source: 'semantic_scholar' | 'arxiv'
}

interface ProcessedDoc {
  paperId: string
  title: string
  text: string
  pageCount: number
  totalChars: number
  hasImageWarning: boolean
  error?: string
}

type SearchPhase = 'idle' | 'searching' | 'results' | 'error'
type DocPhase = 'none' | 'processing' | 'ready'

/* ─────────────────────────────────────────────
   Pure helpers
   ───────────────────────────────────────────── */

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function markdownToHtml(md: string): string {
  let html = escapeHtml(md)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
  html = html.replace(/^---$/gm, '<hr>')
  html = html.split(/\n{2,}/).map(block => {
    if (/^<(h[1-6]|ul|ol|li|blockquote|hr)/.test(block.trim())) return block
    return `<p>${block.replace(/\n/g, '<br>')}</p>`
  }).join('\n')
  return html
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

function selectContext(question: string, docs: ProcessedDoc[]): string {
  const combined = docs.map(d => `【${d.title}】\n${d.text}`).join('\n\n---\n\n')
  if (combined.length < FULL_TEXT_THRESHOLD) return combined
  return docs
    .map(d => {
      const chunk = d.text.length > 10_000 ? d.text.slice(0, 10_000) : d.text
      return { title: d.title, text: chunk, score: scoreChunk(question, chunk) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(d => `【${d.title}】\n${d.text}`)
    .join('\n\n---\n\n')
}

async function extractPdfText(pdfUrl: string): Promise<{ text: string; pageCount: number; hasImageWarning: boolean }> {
  const resp = await fetch(`/api/papers/pdf?url=${encodeURIComponent(pdfUrl)}`)
  if (!resp.ok) {
    const json = await resp.json().catch(() => null)
    throw new Error(json?.error ?? `PDF 下載失敗：HTTP ${resp.status}`)
  }
  const ab = await resp.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((it: any) => it.str).join(' '))
  }
  const text = pages.join('\n\n')
  const avgCharsPerPage = text.length / Math.max(doc.numPages, 1)
  return { text, pageCount: doc.numPages, hasImageWarning: avgCharsPerPage < 100 }
}

/* ─────────────────────────────────────────────
   Icons
   ───────────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
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
      <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
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
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
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
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function AlertTriangleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
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

export default function PaperDoc({ onBack }: Props) {
  const { user } = useAuth()
  // ── Theme & layout
  const [isDark, setIsDark] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ── LLM settings
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('openai')
  const [llmSaved, setLlmSaved] = useState<LlmConfig>(LLM_INIT)
  const [llmDraft, setLlmDraft] = useState<LlmConfig>(LLM_INIT)
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [temperature, setTemperature] = useState(0.7)

  // ── Search
  const [topic, setTopic] = useState('')
  const [desc, setDesc] = useState('')
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle')
  const [searchResults, setSearchResults] = useState<{ withPdf: Paper[]; withoutPdf: Paper[] } | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  // ── Selection & processing
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [docPhase, setDocPhase] = useState<DocPhase>('none')
  const [processedDocs, setProcessedDocs] = useState<ProcessedDoc[]>([])
  const [processingIdx, setProcessingIdx] = useState(-1)
  const [processingTotal, setProcessingTotal] = useState(0)

  // ── Q&A
  const [messages, setMessages] = useState<Message[]>([])
  const [convProvider, setConvProvider] = useState<LlmProvider | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isComposing, setIsComposing] = useState(false)

  // ── Token toast
  const [tokenToast, setTokenToast] = useState<{ provider: string; tokens: number } | null>(null)

  // ── Doc info card collapse
  const [docInfoOpen, setDocInfoOpen] = useState(true)

  // ── Summary
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryDocIdx, setSummaryDocIdx] = useState(-1)
  const [summaryOpen, setSummaryOpen] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  /* ── Search ── */

  async function handleSearch() {
    if (!topic.trim() || searchPhase === 'searching') return
    setSearchPhase('searching')
    setSearchError(null)
    setSelectedIds(new Set())
    setDocPhase('none')
    setProcessedDocs([])
    setMessages([])
    setSummaries({})
    setConvProvider(null)

    try {
      const resp = await fetch(`/api/papers/search?topic=${encodeURIComponent(topic)}&desc=${encodeURIComponent(desc)}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setSearchResults(data)
      setSearchPhase('results')
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '搜尋失敗')
      setSearchPhase('error')
    }
  }

  /* ── PDF selection ── */

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    if (docPhase !== 'none') {
      setDocPhase('none')
      setProcessedDocs([])
    }
    setMessages([])
    setSummaries({})
    setConvProvider(null)
    setError(null)
  }

  /* ── Confirm & process selected PDFs ── */

  async function handleConfirmDocs() {
    if (!searchResults || selectedIds.size === 0) return
    const selectedPapers = searchResults.withPdf.filter(p => selectedIds.has(p.id))
    if (selectedPapers.length === 0) return

    setDocPhase('processing')
    setProcessingTotal(selectedPapers.length)
    setProcessingIdx(0)

    const docs: ProcessedDoc[] = []
    for (let i = 0; i < selectedPapers.length; i++) {
      setProcessingIdx(i)
      const paper = selectedPapers[i]
      try {
        const result = await extractPdfText(paper.pdfUrl!)
        docs.push({
          paperId: paper.id,
          title: paper.title,
          text: result.text,
          pageCount: result.pageCount,
          totalChars: result.text.length,
          hasImageWarning: result.hasImageWarning,
        })
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        docs.push({
          paperId: paper.id,
          title: paper.title,
          text: '',
          pageCount: 0,
          totalChars: 0,
          hasImageWarning: false,
          error: errMsg,
        })
      }
    }

    setProcessedDocs(docs)
    setDocPhase('ready')
    setProcessingIdx(-1)
  }

  /* ── Send message ── */

  async function handleSend() {
    if (!isLlmConfigured() || !input.trim() || loading || processedDocs.length === 0) return
    if (convProvider === null) setConvProvider(llmProvider)
    setError(null)

    const question = input.trim()
    const context = selectContext(question, processedDocs)
    const docTitles = processedDocs.map(d => d.title).join('、')
    const systemContent = `以下是論文文獻的內容，請根據此內容回答使用者的問題：\n文獻：${docTitles}\n\n${context}`

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: question }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    const assistantId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

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
  }

  /* ── Summary generation ── */

  async function streamDocSummary(doc: ProcessedDoc): Promise<void> {
    const docId = doc.paperId
    const prompt = `請為以下論文「${doc.title}」提供一段 150 字以內的重點摘要（繁體中文）：\n\n${doc.text.slice(0, 3000)}`
    setSummaries(prev => ({ ...prev, [docId]: '' }))

    let lastSummaryTokenCount = 0
    try {
      if (llmProvider === 'openai' || llmProvider === 'gemini') {
        const { endpoint, model, apiKey } = getLlmEndpointAndKey()
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: true, temperature, stream_options: { include_usage: true } }),
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
              setSummaries(prev => ({ ...prev, [docId]: accumulated }))
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
                setSummaries(prev => ({ ...prev, [docId]: accumulated }))
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
      setSummaries(prev => ({ ...prev, [docId]: '（生成失敗）' }))
    }
    if (lastSummaryTokenCount > 0) {
      reportTokens(user, llmProvider, lastSummaryTokenCount)
      setTokenToast({ provider: llmProvider, tokens: lastSummaryTokenCount })
    }
  }

  async function handleGenerateSummaries() {
    if (processedDocs.length === 0 || summaryLoading || !isLlmConfigured()) return
    setSummaryLoading(true)
    setSummaries({})
    setSummaryOpen(true)

    for (let i = 0; i < processedDocs.length; i++) {
      setSummaryDocIdx(i)
      await streamDocSummary(processedDocs[i])
    }

    setSummaryLoading(false)
    setSummaryDocIdx(-1)
  }

  /* ── PDF exports ── */

  function handlePrintQA() {
    if (!messages.length) return
    const rows = messages.map(m => {
      const role = m.role === 'user' ? '你' : 'AI'
      const content = markdownToHtml(m.content)
      return `<div class="msg ${m.role}"><div class="role">${role}</div><div class="content">${content}</div></div>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文獻問答紀錄</title>
<style>body{font-family:'Noto Sans TC',sans-serif;max-width:720px;margin:40px auto;color:#1a1a1a;font-size:14px;line-height:1.7}
h1{font-size:20px;margin-bottom:6px}.date{color:#888;font-size:12px;margin-bottom:24px}
.msg{margin:14px 0;display:flex;gap:12px;align-items:flex-start}.role{font-weight:700;min-width:28px;color:#666;flex-shrink:0;padding-top:2px}
.content{flex:1;background:#f5f5f5;padding:10px 14px;border-radius:8px;word-break:break-word}
.user{flex-direction:row-reverse}.user .role{color:#9a6f30}.user .content{background:#fdf6e8}
hr{border:none;border-top:1px solid #eee;margin:24px 0}@media print{body{margin:20px}}</style></head>
<body><h1>文獻問答紀錄</h1><p class="date">${new Date().toLocaleString('zh-TW')}</p><hr/>${rows}</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html); w.document.close(); w.focus(); w.print()
  }

  function handlePrintSummary() {
    const docs = processedDocs.filter(d => summaries[d.paperId])
    if (!docs.length) return

    const rows = docs.map(d =>
      `<div class="doc"><h2>${escapeHtml(d.title)}</h2><p>${escapeHtml(summaries[d.paperId])}</p></div>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>文獻摘要</title>
<style>body{font-family:'Noto Sans TC',sans-serif;max-width:720px;margin:40px auto;color:#1a1a1a;font-size:14px;line-height:1.7}
h1{font-size:20px;margin-bottom:6px}.date{color:#888;font-size:12px;margin-bottom:24px}
.doc{margin:20px 0;padding:16px;background:#f9f9f9;border-radius:8px;border-left:3px solid #9a6f30}
.doc h2{font-size:15px;font-weight:700;color:#0e1f3d;margin-bottom:8px}.doc p{color:#333}
hr{border:none;border-top:1px solid #eee;margin:24px 0}@media print{body{margin:20px}}</style></head>
<body><h1>文獻摘要</h1><p class="date">${new Date().toLocaleString('zh-TW')}</p><hr/>${rows}</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html); w.document.close(); w.focus(); w.print()
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

  function handleNewConversation() {
    setMessages([])
    setConvProvider(null)
    setError(null)
  }

  function handleBackToResults() {
    setDocPhase('none')
    setProcessedDocs([])
    setMessages([])
    setSummaries({})
    setConvProvider(null)
    setError(null)
  }

  /* ── Computed ── */

  const activeProv = convProvider ?? llmProvider
  const hasSummaries = Object.values(summaries).some(s => s && s !== '（生成失敗）')
  const selectedPapers = searchResults?.withPdf.filter(p => selectedIds.has(p.id)) ?? []
  const totalDocChars = processedDocs.reduce((s, d) => s + d.totalChars, 0)

  /* ─────────────────────────────────────────────
     Render
     ───────────────────────────────────────────── */

  return (
    <>
    <div className={`pd-root${isDark ? '' : ' light'}`}>
      {/* ── Sidebar ── */}
      <aside className={`pd-sidebar${sidebarOpen ? '' : ' pd-sidebar--collapsed'}`}>
        <div className="pd-sidebar-head">
          {sidebarOpen && <span className="pd-sidebar-title">設定</span>}
          <button className="pd-sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
          </button>
        </div>

        {sidebarOpen && (
          <div className="pd-sidebar-body">
            {/* LLM Provider Tabs */}
            <div className="pd-llm-tabs">
              {(['openai', 'gemini', 'ollama'] as LlmProvider[]).map(p => (
                <button key={p} className={`pd-llm-tab${llmProvider === p ? ' active' : ''}`}
                  onClick={() => setLlmProvider(p)}>
                  {p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : 'Ollama'}
                </button>
              ))}
            </div>

            {/* LLM Settings */}
            <div className="pd-llm-settings">
              {llmProvider !== 'ollama' ? (
                <>
                  <label className="pd-label">API Key</label>
                  <input className="pd-input" type="password"
                    value={llmDraft[llmProvider].apiKey}
                    onChange={e => setLlmDraft(prev => ({ ...prev, [llmProvider]: { apiKey: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleSaveLlm()}
                    placeholder={llmProvider === 'openai' ? 'sk-...' : 'AIza...'}
                    autoComplete="off"
                  />
                  <div className="pd-llm-actions">
                    <button className="pd-btn-primary" onClick={handleSaveLlm}
                      disabled={!llmDraft[llmProvider].apiKey.trim()}>儲存</button>
                    {llmSaved[llmProvider].apiKey && (
                      <button className="pd-btn-ghost" onClick={handleClearLlm}>清除</button>
                    )}
                  </div>
                  <div className={`pd-key-status${isLlmConfigured() ? ' pd-key-status--ok' : ''}`}>
                    <span className="pd-status-dot" />
                    <span>{isLlmConfigured() ? 'API Key 已設定' : '尚未設定 API Key'}</span>
                  </div>
                  <p className="pd-sidebar-hint">Key 僅存於記憶體，關閉頁面後自動清除。</p>
                </>
              ) : (
                <>
                  <label className="pd-label">Ollama URL</label>
                  <input className="pd-input" type="text"
                    value={llmDraft.ollama.url}
                    onChange={e => setLlmDraft(prev => ({ ...prev, ollama: { ...prev.ollama, url: e.target.value } }))}
                    placeholder="http://localhost:11434"
                  />
                  <label className="pd-label">Model</label>
                  <input className="pd-input" type="text"
                    value={llmDraft.ollama.model}
                    onChange={e => setLlmDraft(prev => ({ ...prev, ollama: { ...prev.ollama, model: e.target.value } }))}
                    placeholder="llama3"
                  />
                  <div className="pd-llm-actions">
                    <button className="pd-btn-primary" onClick={handleSaveLlm}>儲存</button>
                    <button className="pd-btn-ghost" onClick={handleTestOllama}
                      disabled={ollamaStatus === 'checking'}>
                      {ollamaStatus === 'checking' ? '測試中…' : '測試連線'}
                    </button>
                  </div>
                  {ollamaStatus === 'ok' && (
                    <div className="pd-key-status pd-key-status--ok">
                      <span className="pd-status-dot" /><span>連線成功</span>
                    </div>
                  )}
                  {ollamaStatus === 'error' && (
                    <p className="pd-sidebar-hint" style={{ color: 'var(--danger)' }}>
                      ⚠ 無法連線，請確認 URL 是否正確，以及 Ollama 服務是否已啟動。
                    </p>
                  )}
                  <p className="pd-sidebar-hint">設定僅存於記憶體，關閉頁面後自動清除。</p>
                </>
              )}
            </div>

            {/* Temperature */}
            <div className="pd-temperature-section">
              <div className="pd-temp-header">
                <span className="pd-temp-icon"><ThermometerIcon /></span>
                <span className="pd-temp-label">Temperature</span>
                <span className="pd-temp-value">{temperature.toFixed(1)}</span>
              </div>
              <input type="range" className="pd-temp-slider"
                min="0" max="2" step="0.1"
                value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
              />
            </div>

            {/* Selected docs list (when ready) */}
            {docPhase === 'ready' && processedDocs.length > 0 && (
              <div className="pd-selected-docs-section">
                <div className="pd-section-label">已選文獻</div>
                {processedDocs.map(doc => (
                  <div key={doc.paperId} className="pd-doc-item">
                    <div className="pd-doc-item-title">{doc.title}</div>
                    <div className="pd-doc-item-meta">
                      {doc.pageCount > 0 ? `${doc.pageCount} 頁 · ` : ''}{(doc.totalChars / 1000).toFixed(1)}k 字
                    </div>
                    {doc.hasImageWarning && (
                      <div className="pd-img-warning">⚠ 圖片偏多，文字可能不完整</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Summary section (when ready) */}
            {docPhase === 'ready' && processedDocs.length > 0 && (
              <div className="pd-summary-section">
                <button className="pd-btn-primary pd-summary-btn"
                  onClick={handleGenerateSummaries}
                  disabled={summaryLoading || !isLlmConfigured()}>
                  {summaryLoading
                    ? `生成中（${summaryDocIdx + 1}/${processedDocs.length}）…`
                    : '一鍵生成摘要'}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <div className="pd-main">
        {/* Topbar */}
        <header className="pd-topbar">
          <div className="pd-topbar-left">
            <span className="pd-topbar-icon"><DocumentIcon /></span>
            <span className="pd-topbar-title">文獻探索</span>
          </div>
          <div className="pd-topbar-right">
            {docPhase === 'ready' && (
              <>
                <div className="pd-provider-badge">{activeProv}</div>
                <button className="pd-icon-btn" onClick={handleNewConversation} title="新對話">
                  <NewChatIcon />
                </button>
                <button className="pd-back-btn" onClick={handleBackToResults} title="返回搜尋結果">
                  <SearchIcon /> 返回結果
                </button>
                {messages.length > 0 && (
                  <button className="pd-icon-btn" onClick={handlePrintQA} title="下載問答 PDF">
                    <PrinterIcon />
                  </button>
                )}
              </>
            )}
            <button className="pd-icon-btn" onClick={() => setIsDark(!isDark)} title="切換主題">
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="pd-icon-btn" onClick={onBack} title="返回首頁">
              <HomeIcon />
            </button>
            <AuthUserIcon />
          </div>
        </header>

        {/* Content area */}
        <div className="pd-content">

          {/* Search + Results (docPhase === 'none') */}
          {docPhase === 'none' && (
            <div className="pd-search-area">
              <div className="pd-search-card">
                <h2 className="pd-search-heading">探索學術文獻</h2>
                <p className="pd-search-sub">搜尋來源：Semantic Scholar · arXiv・建議使用英文關鍵詞</p>
                <div className="pd-search-fields">
                  <div className="pd-field">
                    <label className="pd-field-label">研究主題</label>
                    <input className="pd-input pd-search-input" type="text"
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      placeholder="例：transformer attention mechanism"
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    />
                  </div>
                  <div className="pd-field">
                    <label className="pd-field-label">需求描述（選填）</label>
                    <input className="pd-input pd-search-input" type="text"
                      value={desc}
                      onChange={e => setDesc(e.target.value)}
                      placeholder="例：compare efficiency and accuracy of attention mechanisms"
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    />
                  </div>
                </div>
                <button className="pd-btn-primary pd-search-btn"
                  onClick={handleSearch}
                  disabled={!topic.trim() || searchPhase === 'searching'}>
                  {searchPhase === 'searching' ? (
                    <><span className="pd-spinner" />&nbsp;搜尋中…</>
                  ) : (
                    <><SearchIcon />&nbsp;探索</>
                  )}
                </button>
              </div>

              {searchPhase === 'error' && (
                <div className="pd-error-banner">搜尋失敗：{searchError}</div>
              )}

              {searchPhase === 'results' && searchResults && (
                <div className="pd-results">
                  {/* With PDF */}
                  {searchResults.withPdf.length > 0 && (
                    <div className="pd-results-section">
                      <h3 className="pd-section-heading">
                        <span className="pd-section-badge pd-section-badge--pdf">含 PDF</span>
                        {searchResults.withPdf.length} 篇（可勾選進行問答）
                      </h3>
                      <div className="pd-papers-list">
                        {searchResults.withPdf.map(paper => (
                          <div key={paper.id} className={`pd-paper-card${selectedIds.has(paper.id) ? ' selected' : ''}`}>
                            <label className="pd-paper-check">
                              <input type="checkbox"
                                checked={selectedIds.has(paper.id)}
                                onChange={() => toggleSelect(paper.id)}
                                className="pd-checkbox"
                              />
                            </label>
                            <div className="pd-paper-body">
                              <div className="pd-paper-title">{paper.title}</div>
                              <div className="pd-paper-meta">
                                {paper.authors.slice(0, 3).join(', ')}
                                {paper.authors.length > 3 ? ' et al.' : ''}
                                {paper.year ? ` · ${paper.year}` : ''}
                                <span className="pd-source-tag">
                                  {paper.source === 'arxiv' ? 'arXiv' : 'Semantic Scholar'}
                                </span>
                              </div>
                              {paper.abstract && (
                                <p className="pd-paper-abstract">
                                  {paper.abstract.slice(0, 200)}{paper.abstract.length > 200 ? '…' : ''}
                                </p>
                              )}
                            </div>
                            <div className="pd-paper-actions">
                              <a className="pd-icon-btn-sm"
                                href={`/api/papers/pdf?url=${encodeURIComponent(paper.pdfUrl!)}`}
                                download={`${paper.title.slice(0, 50)}.pdf`}
                                title="下載 PDF">
                                <DownloadIcon />
                              </a>
                              <a className="pd-icon-btn-sm"
                                href={paper.pageUrl} target="_blank" rel="noopener noreferrer"
                                title="開啟頁面">
                                <ExternalLinkIcon />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Without PDF */}
                  {searchResults.withoutPdf.length > 0 && (
                    <div className="pd-results-section">
                      <h3 className="pd-section-heading">
                        <span className="pd-section-badge pd-section-badge--link">外部連結</span>
                        {searchResults.withoutPdf.length} 篇（無公開 PDF）
                      </h3>
                      <div className="pd-papers-list">
                        {searchResults.withoutPdf.map(paper => (
                          <div key={paper.id} className="pd-paper-card pd-paper-card--link">
                            <div className="pd-paper-body">
                              <div className="pd-paper-title">{paper.title}</div>
                              <div className="pd-paper-meta">
                                {paper.authors.slice(0, 3).join(', ')}
                                {paper.authors.length > 3 ? ' et al.' : ''}
                                {paper.year ? ` · ${paper.year}` : ''}
                                <span className="pd-source-tag">
                                  {paper.source === 'arxiv' ? 'arXiv' : 'Semantic Scholar'}
                                </span>
                              </div>
                              {paper.abstract && (
                                <p className="pd-paper-abstract">
                                  {paper.abstract.slice(0, 200)}{paper.abstract.length > 200 ? '…' : ''}
                                </p>
                              )}
                            </div>
                            <div className="pd-paper-actions">
                              <a className="pd-icon-btn-sm"
                                href={paper.pageUrl} target="_blank" rel="noopener noreferrer"
                                title="開啟頁面">
                                <ExternalLinkIcon />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.withPdf.length === 0 && searchResults.withoutPdf.length === 0 && (() => {
                    const hasNonAscii = /[^\x00-\x7F]/.test(topic + desc)
                    return (
                      <div className="pd-empty">
                        未找到相關文獻。
                        {hasNonAscii
                          ? <><br />Semantic Scholar 與 arXiv 以英文論文為主，建議改用英文關鍵詞搜尋。</>
                          : <>請嘗試不同的關鍵詞。</>
                        }
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Processing phase */}
          {docPhase === 'processing' && (
            <div className="pd-processing-area">
              <div className="pd-processing-card">
                <div className="pd-processing-spinner" />
                <div className="pd-processing-title">正在處理文獻</div>
                <div className="pd-processing-text">
                  {processingIdx + 1} / {processingTotal}
                </div>
                <div className="pd-processing-progress-wrap">
                  <div className="pd-processing-bar"
                    style={{ width: `${processingTotal > 0 ? ((processingIdx + 1) / processingTotal) * 100 : 0}%` }} />
                </div>
                {processingIdx >= 0 && selectedPapers[processingIdx] && (
                  <div className="pd-processing-doc-title">{selectedPapers[processingIdx].title}</div>
                )}
              </div>
            </div>
          )}

          {/* Ready phase: doc info + messages + input */}
          {docPhase === 'ready' && (
            <>
              {/* Doc info card */}
              <div className="pd-doc-info-card">
                <button className="pd-doc-info-header" onClick={() => setDocInfoOpen(!docInfoOpen)}>
                  <span className="pd-doc-info-count">{processedDocs.length} 份文獻</span>
                  <span className="pd-doc-info-total">{(totalDocChars / 1000).toFixed(1)}k 字</span>
                  <span className="pd-doc-info-chevron">
                    {docInfoOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  </span>
                </button>
                {docInfoOpen && (
                  <div className="pd-doc-info-grid">
                    {processedDocs.map(doc => (
                      <div key={doc.paperId} className="pd-doc-stat">
                        <div className="pd-doc-stat-title">{doc.title}</div>
                        <div className="pd-doc-stat-meta">
                          {doc.pageCount > 0 && <span>{doc.pageCount} 頁</span>}
                          {!doc.error && <span>{(doc.totalChars / 1000).toFixed(1)}k 字</span>}
                          {doc.hasImageWarning && (
                            <span className="pd-img-warning-badge">
                              <AlertTriangleIcon /> 圖片偏多，此 LLM 可能無法解讀圖片，或目前無法擷取 PDF 圖片進行解讀
                            </span>
                          )}
                          {doc.error && (
                            <span className="pd-img-warning-badge" style={{ color: 'var(--danger)' }}>
                              <AlertTriangleIcon /> PDF 提取失敗：{doc.error}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary panel */}
              {Object.keys(summaries).length > 0 && (
                <div className={`pd-summary-panel${summaryOpen ? '' : ' pd-summary-panel--collapsed'}`}>
                  <div className="pd-summary-header">
                    <span className="pd-summary-header-title">文獻摘要</span>
                    {hasSummaries && !summaryLoading && (
                      <button className="pd-summary-header-btn" onClick={handlePrintSummary} title="下載摘要 PDF">
                        <PrinterIcon />
                      </button>
                    )}
                    <button className="pd-summary-header-btn" onClick={() => setSummaryOpen(!summaryOpen)} title={summaryOpen ? '收合' : '展開'}>
                      {summaryOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    </button>
                  </div>
                  {summaryOpen && (
                    <div className="pd-summary-body">
                      {processedDocs.map((doc, i) => (
                        <div key={doc.paperId} className="pd-summary-item">
                          <div className="pd-summary-doc-title">
                            <span>{i + 1}. {doc.title}</span>
                            {summaryDocIdx === i && <span className="pd-summary-spinner" />}
                          </div>
                          {summaries[doc.paperId]
                            ? <div className="pd-summary-text">{summaries[doc.paperId]}</div>
                            : summaryDocIdx > i || summaryDocIdx === -1 ? null
                            : <span className="pd-muted" style={{ fontSize: '12px' }}>等待中…</span>
                          }
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="pd-messages">
                {messages.length === 0 && (
                  <div className="pd-messages-empty">
                    已載入 {processedDocs.length} 份文獻，共 {(totalDocChars / 1000).toFixed(1)}k 字。
                    <br />開始提問以深入探討文獻內容。
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`pd-msg pd-msg--${msg.role}`}>
                    <div className="pd-msg-avatar">
                      {msg.role === 'user' ? <UserIcon /> : <DocumentIcon />}
                    </div>
                    <div className="pd-msg-bubble">
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || '…'}</ReactMarkdown>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {loading && messages[messages.length - 1]?.content === '' && (
                  <div className="pd-typing"><span /><span /><span /></div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {error && <div className="pd-error-banner">{error}</div>}

              {/* Input */}
              <div className="pd-input-area">
                <textarea
                  ref={textareaRef}
                  className="pd-textarea"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  placeholder={isLlmConfigured() ? '詢問文獻相關問題…' : '請先在側邊欄設定 LLM API Key'}
                  rows={1}
                  disabled={loading || !isLlmConfigured()}
                />
                <button className="pd-send-btn"
                  onClick={handleSend}
                  disabled={!input.trim() || loading || !isLlmConfigured()}>
                  <SendIcon />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Sticky confirm bar */}
        {selectedIds.size > 0 && docPhase === 'none' && (
          <div className="pd-confirm-bar">
            <span className="pd-confirm-text">已選取 {selectedIds.size} 篇 PDF</span>
            <button className="pd-btn-primary" onClick={handleConfirmDocs}>
              確認所選文件並開始問答
            </button>
          </div>
        )}
      </div>
    </div>
    {tokenToast && (
      <TokenToast provider={tokenToast.provider} tokens={tokenToast.tokens} onDone={() => setTokenToast(null)} />
    )}
    </>
  )
}
