import { useState, useEffect, useRef, useCallback } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './Learner.css'

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface Highlight { keyword: string; explanation: string }

interface CodePractice {
  type: 'code'
  prompt: string
  answers: string[]
  hint?: string
}
interface ActionPractice {
  type: 'action'
  prompt: string
  items: string[]
}
type Practice = CodePractice | ActionPractice

interface Section {
  id: string
  title: string
  content: string
  highlights?: Highlight[]
  practice?: Practice
}

interface TopicMeta { id: string; name: string; description: string }
interface Topic extends TopicMeta {
  levels: { beginner?: Section[]; intermediate?: Section[]; advanced?: Section[] }
}

type Level = 'beginner' | 'intermediate' | 'advanced'

const LEVEL_LABELS: Record<Level, string> = {
  beginner: '初階',
  intermediate: '進階',
  advanced: '高階',
}

/* ─────────────────────────────────────────────
   Prompt template
   ───────────────────────────────────────────── */

const PROMPT_TEMPLATE = `你是一位專業的學習內容設計師。請針對「{主題名稱}」這個學習主題，產出一份嚴格符合以下 JSON 格式的學習檔案。

【格式規範】
{
  "id": "唯一英文 id（小寫 + 連字號）",
  "name": "主題顯示名稱",
  "description": "一句話簡介（30字以內）",
  "levels": {
    "beginner": [
      {
        "id": "段落唯一英文 id",
        "title": "段落標題",
        "content": "說明文字（200–400字），可包含後面 highlights 中的關鍵詞",
        "highlights": [
          { "keyword": "出現在 content 中的關鍵詞", "explanation": "點擊後顯示的補充說明（50–100字）" }
        ],
        "practice": {
          "type": "code",
          "prompt": "題目說明",
          "answers": ["正確答案1", "正確答案2"],
          "hint": "提示文字（可選）"
        }
      }
    ],
    "intermediate": [],
    "advanced": []
  }
}

【規則】
- 根據主題深度決定要提供哪些 level（初學者主題只需 beginner 也可）
- 每個 level 提供 4–6 個 section
- 若主題屬於程式/指令操作，practice.type 用 "code"；若屬於觀念/行為改變，用 "action"（此時將 answers 換成 items 陣列，列出 3–5 個具體行動建議）
- highlights 每個 section 建議 1–3 個關鍵詞
- 只輸出純 JSON，不加任何 Markdown 包覆或說明文字

主題：{主題名稱}`

/* ─────────────────────────────────────────────
   Icons
   ───────────────────────────────────────────── */

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
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

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  )
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string }

interface Props { onBack: () => void }

export default function Learner({ onBack }: Props) {
  const [isDark, setIsDark] = useState(false)
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>('md')

  const FONT_CYCLE: Record<'sm' | 'md' | 'lg', 'sm' | 'md' | 'lg'> = { sm: 'md', md: 'lg', lg: 'sm' }
  const FONT_LABEL: Record<'sm' | 'md' | 'lg', string> = { sm: '小', md: '中', lg: '大' }
  const [topics, setTopics] = useState<TopicMeta[]>([])
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null)
  const [activeLevel, setActiveLevel] = useState<Level>('beginner')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, boolean | null>>({})
  const [shownAnswers, setShownAnswers] = useState<Record<string, boolean>>({})
  const [highlight, setHighlight] = useState<{ keyword: string; explanation: string; x: number; y: number } | null>(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [promptTopicName, setPromptTopicName] = useState('')
  const [copied, setCopied] = useState(false)
  const [pasteJson, setPasteJson] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [pasteSuccess, setPasteSuccess] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null)
  const [deleteInput, setDeleteInput] = useState('')

  // LLM 設定（跨主題保留）
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmTemperature, setLlmTemperature] = useState(0.7)
  const [llmApiKeyInput, setLlmApiKeyInput] = useState('')

  // 聊天面板
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const [chatTopicId, setChatTopicId] = useState<string | null>(null)

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const contentRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  /* ── Load topics list ── */
  useEffect(() => {
    fetch('/api/learner').then(r => r.json()).then(setTopics).catch(() => {})
  }, [])

  /* ── Load topic detail ── */
  function handleSelectTopic(id: string) {
    if (activeTopic?.id === id) return
    fetch(`/api/learner/${id}`)
      .then(r => r.json())
      .then((data: Topic) => {
        setActiveTopic(data)
        const firstLevel = (['beginner', 'intermediate', 'advanced'] as const)
          .find(l => (data.levels[l]?.length ?? 0) > 0)
        setActiveLevel(firstLevel ?? 'beginner')
        setAnswers({})
        setResults({})
        sectionRefs.current.clear()
        if (contentRef.current) contentRef.current.scrollTo({ top: 0 })
      })
      .catch(() => {})
  }

  /* ── Entrance animation observer ── */
  const animObserverRef = useRef<IntersectionObserver | null>(null)

  const registerSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el)
    else sectionRefs.current.delete(id)
  }, [])

  useEffect(() => {
    if (animObserverRef.current) animObserverRef.current.disconnect()
    const content = contentRef.current
    if (!content) return

    sectionRefs.current.forEach(el => el.classList.remove('lr-section--visible'))

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) entry.target.classList.add('lr-section--visible')
        })
      },
      { root: content, threshold: 0.08 }
    )
    animObserverRef.current = observer
    sectionRefs.current.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [activeTopic, activeLevel])

  /* ── Close highlight popover on outside click ── */
  useEffect(() => {
    if (!highlight) return
    const handler = () => setHighlight(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [highlight])

  /* ── Reset chat when topic changes ── */
  useEffect(() => {
    if (!activeTopic) return
    if (chatTopicId !== activeTopic.id) {
      setChatMessages([])
      setChatInput('')
      setChatError('')
      setChatTopicId(activeTopic.id)
    }
  }, [activeTopic?.id])

  /* ── Auto-scroll chat to bottom ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  /* ── Highlight renderer ── */
  function renderHighlighted(content: string, highlights: Highlight[] = []) {
    if (!highlights.length) return <span>{content}</span>
    const keywords = highlights.map(h => h.keyword)
    const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(`(${escaped.join('|')})`, 'g')
    const parts = content.split(pattern)
    return (
      <>
        {parts.map((part, i) => {
          const hl = highlights.find(h => h.keyword === part)
          if (hl) return (
            <span
              key={i}
              className="lr-highlight"
              onClick={e => {
                e.stopPropagation()
                const rect = (e.target as HTMLElement).getBoundingClientRect()
                setHighlight({ ...hl, x: rect.left, y: rect.bottom + 8 })
              }}
            >
              {part}
            </span>
          )
          return <span key={i}>{part}</span>
        })}
      </>
    )
  }

  /* ── Code practice submit ── */
  function handleSubmit(section: Section) {
    if (section.practice?.type !== 'code') return
    const input = (answers[section.id] ?? '').trim()
    const correct = section.practice.answers.some(a => a.trim() === input)
    setResults(prev => ({ ...prev, [section.id]: correct }))
  }

  /* ── Import topic from pasted JSON ── */
  function handleImportJson() {
    setPasteError('')
    setPasteSuccess(false)
    let data: unknown
    try {
      data = JSON.parse(pasteJson)
    } catch {
      setPasteError('JSON 格式錯誤，請確認內容是否完整。')
      return
    }
    const d = data as Record<string, unknown>
    if (!d.id || !d.name || !d.levels) {
      setPasteError('缺少必要欄位：id、name、levels。')
      return
    }
    fetch('/api/learner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: pasteJson,
    })
      .then(r => r.json())
      .then(res => {
        if (res.error) { setPasteError(res.error); return }
        setPasteSuccess(true)
        setPasteJson('')
        fetch('/api/learner').then(r => r.json()).then(setTopics).catch(() => {})
        setTimeout(() => setPasteSuccess(false), 3000)
      })
      .catch(() => setPasteError('伺服器錯誤，請稍後再試。'))
  }

  /* ── Delete topic ── */
  function handleDeleteTopic() {
    if (!deleteModal || deleteInput !== 'DELETE') return
    const { id } = deleteModal
    fetch(`/api/learner/${id}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(res => {
        if (res.error) return
        setTopics(prev => prev.filter(t => t.id !== id))
        if (activeTopic?.id === id) setActiveTopic(null)
        setDeleteModal(null)
        setDeleteInput('')
      })
      .catch(() => {})
  }

  function handlePrintTopic() {
    if (!activeTopic) return
    const LEVEL_NAMES: Record<Level, string> = { beginner: '初階', intermediate: '進階', advanced: '高階' }

    function renderContent(content: string, highlights: Highlight[] = []) {
      if (!highlights.length) return escHtml(content)
      let result = escHtml(content)
      highlights.forEach(h => {
        result = result.replace(
          new RegExp(escRegex(escHtml(h.keyword)), 'g'),
          `<strong>${escHtml(h.keyword)}</strong>`
        )
      })
      return result
    }

    const levelsHtml = availableLevels.map(level => {
      const sections = activeTopic.levels[level] ?? []
      const sectionsHtml = sections.map(s => {
        let practiceHtml = ''
        if (s.practice?.type === 'code') {
          practiceHtml = `
            <div class="practice">
              <p class="practice-prompt">${escHtml(s.practice.prompt)}</p>
              <div class="practice-input"></div>
              ${s.practice.hint ? `<p class="practice-hint">提示：${escHtml(s.practice.hint)}</p>` : ''}
            </div>`
        } else if (s.practice?.type === 'action') {
          const items = s.practice.items.map(i => `<li>${escHtml(i)}</li>`).join('')
          practiceHtml = `
            <div class="practice">
              <p class="practice-prompt">${escHtml(s.practice.prompt)}</p>
              <ul class="action-list">${items}</ul>
            </div>`
        }
        return `
          <div class="section">
            <h2>${escHtml(s.title)}</h2>
            <p class="content">${renderContent(s.content, s.highlights)}</p>
            ${practiceHtml}
          </div>`
      }).join('')
      return `
        <div class="level-block">
          <div class="level-badge">${LEVEL_NAMES[level]}</div>
          ${sectionsHtml}
        </div>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escHtml(activeTopic.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;600;700&family=DM+Mono&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans TC', sans-serif; background: #fff; color: #1a1a1a;
         max-width: 740px; margin: 0 auto; padding: 48px 40px 64px; font-size: 14px; line-height: 1.8; }
  .topic-eyebrow { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.25em;
                   text-transform: uppercase; color: #c8a96e; margin-bottom: 10px; }
  .topic-name { font-size: 28px; font-weight: 700; color: #0e1f3d; line-height: 1.2; margin-bottom: 10px; }
  .topic-divider { width: 40px; height: 2px; background: #c8a96e; margin: 14px 0; }
  .topic-desc { font-size: 15px; font-weight: 300; color: #555; letter-spacing: 0.04em; margin-bottom: 8px; }
  .print-date { font-size: 11px; color: #aaa; font-family: 'DM Mono', monospace; margin-bottom: 40px; }
  .level-block { margin-bottom: 40px; }
  .level-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; border: 1px solid #c8a96e;
                 font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em;
                 color: #c8a96e; margin-bottom: 20px; }
  .section { border-left: 2px solid #e8d8b8; padding: 20px 24px; margin-bottom: 20px;
             background: #fdfbf7; border-radius: 0 10px 10px 0; }
  h2 { font-size: 16px; font-weight: 600; color: #0e1f3d; margin-bottom: 10px; line-height: 1.3; }
  .content { font-weight: 300; color: #444; line-height: 1.85; letter-spacing: 0.03em; }
  .content strong { font-weight: 700; color: #9a6f30; }
  .practice { margin-top: 16px; padding-top: 14px; border-top: 1px solid #e8d8b8; }
  .practice-prompt { font-weight: 400; color: #1a1a1a; margin-bottom: 8px; letter-spacing: 0.03em; }
  .practice-input { height: 36px; border-bottom: 1px solid #bbb; margin: 8px 0 4px; }
  .practice-hint { font-size: 12px; color: #888; margin-top: 4px; }
  .action-list { padding-left: 20px; margin-top: 6px; }
  .action-list li { color: #555; margin-bottom: 4px; font-weight: 300; }
  @media print {
    body { padding: 20px; }
    .section { break-inside: avoid; }
    .level-block { break-inside: avoid; }
  }
</style></head><body>
<p class="topic-eyebrow">學習主題</p>
<h1 class="topic-name">${escHtml(activeTopic.name)}</h1>
<div class="topic-divider"></div>
<p class="topic-desc">${escHtml(activeTopic.description)}</p>
<p class="print-date">${new Date().toLocaleString('zh-TW')}</p>
${levelsHtml}
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  function handlePrintChat() {
    if (!activeTopic || chatMessages.length === 0) return
    const rows = chatMessages.map(m => {
      const role = m.role === 'user' ? '我' : 'AI'
      const cls = m.role === 'user' ? 'user' : 'assistant'
      const body = m.role === 'assistant'
        ? renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>)
        : `<p>${m.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      return `<div class="msg ${cls}"><span class="role">${role}</span><div class="content">${body}</div></div>`
    }).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${activeTopic.name} — 問答紀錄</title>
<style>
  body { font-family: 'Noto Sans TC', sans-serif; max-width: 720px; margin: 40px auto; color: #1a1a1a; font-size: 14px; line-height: 1.7; }
  h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .date { font-size: 12px; color: #888; margin-bottom: 32px; }
  .msg { display: flex; gap: 12px; margin-bottom: 18px; }
  .role { font-weight: 700; font-size: 12px; min-width: 24px; padding-top: 2px; color: #888; flex-shrink: 0; }
  .msg.user .role { color: #9a6f30; }
  .content { word-break: break-word; min-width: 0; }
  .content p { margin: 0 0 6px; }
  .content p:last-child { margin-bottom: 0; }
  .content ul, .content ol { padding-left: 20px; margin: 4px 0; }
  .content li { margin-bottom: 2px; }
  .content code { font-family: monospace; font-size: 12px; background: #f4f0e8; padding: 1px 5px; border-radius: 3px; }
  .content pre { background: #f4f0e8; border-radius: 6px; padding: 10px 14px; overflow-x: auto; margin: 6px 0; }
  .content pre code { background: none; padding: 0; }
  .content blockquote { border-left: 3px solid #c8a96e; padding-left: 10px; margin: 6px 0; color: #666; }
  .content strong { font-weight: 700; }
  .content table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
  .content th, .content td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  .content th { background: #f5f0e8; font-weight: 700; }
  .content tr:nth-child(even) td { background: #faf8f4; }
  hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>${activeTopic.name} — 問答紀錄</h1>
<p class="date">${new Date().toLocaleString('zh-TW')}</p>
<hr/>${rows}</body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  function handleDownloadTopic(id: string) {
    fetch(`/api/learner/${id}`)
      .then(r => r.json())
      .then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${id}.json`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => {})
  }

  function openDeleteModal(id: string, name: string) {
    setDeleteModal({ id, name })
    setDeleteInput('')
  }

  /* ── LLM Chat Submit ── */
  async function handleChatSubmit() {
    if (!chatInput.trim() || !activeTopic || chatLoading) return
    const trimmed = chatInput.trim()

    setChatError('')
    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', content: trimmed }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    const systemPrompt = `你是一個學習助手，請根據以下主題資料回答問題。主題名稱：${activeTopic.name}\n主題說明：${activeTopic.description}\n\n完整主題資料（JSON）：\n${JSON.stringify(activeTopic, null, 2)}`
    const assistantId = (Date.now() + 1).toString()
    setChatMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llmApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          stream: true,
          temperature: llmTemperature,
          messages: [
            { role: 'system', content: systemPrompt },
            ...[...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      })
      if (!res.ok) throw new Error(`API 錯誤：HTTP ${res.status}`)
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content ?? ''
            if (delta) setChatMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + delta } : m
            ))
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e: unknown) {
      setChatError(e instanceof Error ? e.message : String(e))
      setChatMessages(prev => prev.filter(m => m.id !== assistantId))
    } finally {
      setChatLoading(false)
    }
  }

  /* ── Admin prompt ── */
  function getFilledPrompt() {
    return PROMPT_TEMPLATE.replaceAll('{主題名稱}', promptTopicName || '（請填入主題名稱）')
  }

  function handleCopy() {
    navigator.clipboard.writeText(getFilledPrompt()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  /* ── Available levels for current topic ── */
  const availableLevels = activeTopic
    ? (['beginner', 'intermediate', 'advanced'] as Level[]).filter(
        l => (activeTopic.levels[l]?.length ?? 0) > 0
      )
    : []

  const currentSections = activeTopic?.levels[activeLevel] ?? []

  return (
    <div className={`lr-root lr-root--${fontSize}${isDark ? '' : ' light'}`} onClick={() => setHighlight(null)}>

      {/* Sidebar */}
      <aside className="lr-sidebar">
        <p className="lr-sidebar-heading">學習主題</p>
        {topics.length === 0 && (
          <p style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--muted)', opacity: 0.7 }}>
            尚無主題
          </p>
        )}
        {topics.map(t => (
          <button
            key={t.id}
            className={`lr-topic-btn${activeTopic?.id === t.id ? ' lr-topic-btn--active' : ''}`}
            onClick={() => handleSelectTopic(t.id)}
          >
            {t.name}
          </button>
        ))}
      </aside>

      {/* Main */}
      <div className="lr-main">

        {/* Topbar */}
        <div className="lr-topbar">
          <div className="lr-topbar-left">
            <BookIcon />
            <span className="lr-topbar-title">學習者</span>
          </div>
          <div className="lr-topbar-controls">
            <button className="lr-icon-btn" onClick={onBack} aria-label="返回首頁">
              <HomeIcon />
            </button>
            <button
              className="lr-icon-btn lr-font-size-btn"
              onClick={() => setFontSize(FONT_CYCLE[fontSize])}
              aria-label="調整文字大小"
              title={`目前：${FONT_LABEL[fontSize]}，點擊切換`}
            >
              <span className="lr-font-size-label">{FONT_LABEL[fontSize]}</span>
              <span className="lr-font-size-a">A</span>
            </button>
            {activeTopic && (
              <button
                className="lr-icon-btn"
                onClick={handlePrintTopic}
                aria-label="匯出主題為 PDF"
                title="匯出主題為 PDF"
              >
                <PrintIcon />
              </button>
            )}
            <button
              className="lr-icon-btn"
              onClick={e => { e.stopPropagation(); setShowAdmin(v => !v) }}
              aria-label="管理面板"
              title="開發者管理面板"
            >
              <GearIcon />
            </button>
            <button
              className="lr-icon-btn"
              onClick={() => setIsDark(!isDark)}
              aria-label={isDark ? '切換為亮色模式' : '切換為深色模式'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="lr-content" ref={contentRef}>
          {!activeTopic ? (
            <div className="lr-empty">
              <svg className="lr-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <p className="lr-empty-title">選擇一個學習主題</p>
              <p className="lr-empty-hint">從左側清單選取主題以開始學習</p>
            </div>
          ) : (
            <>
              {/* Hero */}
              <div className="lr-hero">
                <p className="lr-hero-eyebrow">學習主題</p>
                <h1 className="lr-hero-name">{activeTopic.name}</h1>
                <div className="lr-hero-divider" />
                <p className="lr-hero-desc">{activeTopic.description}</p>
              </div>

              {/* Level Tabs */}
              {availableLevels.length > 1 && (
                <div className="lr-level-tabs">
                  {availableLevels.map(l => (
                    <button
                      key={l}
                      className={`lr-level-tab${activeLevel === l ? ' lr-level-tab--active' : ''}`}
                      onClick={() => {
                        setActiveLevel(l)
                        if (contentRef.current) contentRef.current.scrollTo({ top: 0 })
                      }}
                    >
                      {LEVEL_LABELS[l]}
                    </button>
                  ))}
                </div>
              )}

              {/* Sections */}
              <div className="lr-sections">
                {currentSections.map(section => (
                  <div
                    key={section.id}
                    className="lr-section"
                    ref={el => registerSectionRef(section.id, el)}
                  >
                    <h2 className="lr-section-title">{section.title}</h2>
                    <p className="lr-section-content">
                      {renderHighlighted(section.content, section.highlights)}
                    </p>

                    {section.practice && (
                      <div className="lr-practice">
                        {section.practice.type === 'code' ? (
                          <>
                            <p className="lr-practice-prompt">{section.practice.prompt}</p>
                            <textarea
                              className="lr-practice-input"
                              rows={1}
                              placeholder="輸入指令..."
                              value={answers[section.id] ?? ''}
                              onChange={e => setAnswers(prev => ({ ...prev, [section.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(section) } }}
                              onClick={e => e.stopPropagation()}
                            />
                            <div className="lr-practice-actions">
                              <button className="lr-submit-btn" onClick={() => handleSubmit(section)}>
                                提交
                              </button>
                              {results[section.id] === true && (
                                <span className="lr-result lr-result--correct">✓ 答對了</span>
                              )}
                              {results[section.id] === false && (
                                <span className="lr-result lr-result--wrong">✗ 再試試看</span>
                              )}
                              {results[section.id] === false && !shownAnswers[section.id] && (
                                <button
                                  className="lr-show-answer-btn"
                                  onClick={() => setShownAnswers(prev => ({ ...prev, [section.id]: true }))}
                                >
                                  查看答案
                                </button>
                              )}
                            </div>
                            {results[section.id] === false && section.practice.hint && (
                              <p className="lr-hint">提示：{section.practice.hint}</p>
                            )}
                            {shownAnswers[section.id] && (
                              <div className="lr-answer-reveal">
                                <span className="lr-answer-label">參考答案：</span>
                                {section.practice.answers.map((a, i) => (
                                  <code key={i} className="lr-answer-code">{a}</code>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="lr-practice-prompt">{section.practice.prompt}</p>
                            <ul className="lr-action-list">
                              {section.practice.items.map((item, i) => (
                                <li key={i} className="lr-action-item">{item}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Highlight Popover */}
      {highlight && (
        <div
          className="lr-hl-popover"
          style={{ left: Math.min(highlight.x, window.innerWidth - 320), top: highlight.y }}
          onClick={e => e.stopPropagation()}
        >
          <p className="lr-hl-popover-keyword">{highlight.keyword}</p>
          <p className="lr-hl-popover-text">{highlight.explanation}</p>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteModal && (
        <div className="lr-delete-backdrop" onClick={() => { setDeleteModal(null); setDeleteInput('') }}>
          <div className="lr-delete-dialog" onClick={e => e.stopPropagation()}>
            <p className="lr-delete-dialog-title">刪除主題</p>
            <p className="lr-delete-dialog-desc">
              即將永久刪除「<strong>{deleteModal.name}</strong>」，此操作無法復原。
            </p>
            <p className="lr-delete-dialog-instruction">
              請輸入 <code>DELETE</code> 以確認：
            </p>
            <input
              className="lr-delete-dialog-input"
              placeholder="DELETE"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleDeleteTopic() }}
              autoFocus
            />
            <div className="lr-delete-dialog-actions">
              <button
                className="lr-delete-dialog-cancel"
                onClick={() => { setDeleteModal(null); setDeleteInput('') }}
              >取消</button>
              <button
                className="lr-delete-dialog-confirm"
                onClick={handleDeleteTopic}
                disabled={deleteInput !== 'DELETE'}
              >確認刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Chat Button */}
      {activeTopic && (
        <button
          className={`lr-chat-fab${chatMessages.length > 0 ? ' lr-chat-fab--active' : ''}`}
          onClick={e => { e.stopPropagation(); setChatOpen(v => !v) }}
          title="主題問答"
        >
          <ChatIcon />
          {chatMessages.length > 0 && !chatOpen && (
            <span className="lr-chat-fab-badge">
              {chatMessages.filter(m => m.role === 'assistant').length}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {chatOpen && activeTopic && (
        <div className="lr-chat-panel" onClick={e => e.stopPropagation()}>
          <div className="lr-chat-header">
            <span className="lr-chat-title">{activeTopic.name}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {chatMessages.length > 0 && (
                <button className="lr-chat-close" onClick={handlePrintChat} title="列印 / 儲存為 PDF">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </button>
              )}
              <button className="lr-chat-close" onClick={() => setChatOpen(false)}>✕</button>
            </div>
          </div>
          {!llmApiKey ? (
            <div className="lr-chat-no-key">
              請先在管理面板（右上角 ⚙）設定 OpenAI API Key
            </div>
          ) : (
            <>
              <div className="lr-chat-messages">
                {chatMessages.length === 0 && (
                  <p className="lr-chat-empty">針對「{activeTopic.name}」提問...</p>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`lr-chat-msg lr-chat-msg--${msg.role}`}>
                    <div className="lr-chat-bubble">
                      {msg.role === 'assistant'
                        ? <div className="lr-chat-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
                        : msg.content
                      }
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="lr-chat-msg lr-chat-msg--assistant">
                    <div className="lr-chat-bubble lr-chat-bubble--loading">▋</div>
                  </div>
                )}
                {chatError && <p className="lr-chat-error">{chatError}</p>}
                <div ref={chatEndRef} />
              </div>
              <div className="lr-chat-input-row">
                <textarea
                  className="lr-chat-input"
                  rows={1}
                  placeholder="輸入問題..."
                  value={chatInput}
                  disabled={chatLoading}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault(); handleChatSubmit()
                    }
                  }}
                />
                <button
                  className="lr-chat-send"
                  disabled={chatLoading || !chatInput.trim()}
                  onClick={handleChatSubmit}
                >
                  <SendIcon />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Admin Panel */}
      {showAdmin && (
        <div className="lr-admin-overlay" onClick={e => e.stopPropagation()}>
          <div className="lr-admin-panel">
            <div className="lr-admin-header">
              <span className="lr-admin-title">開發者管理</span>
              <button className="lr-admin-close" onClick={() => setShowAdmin(false)}>×</button>
            </div>

            {/* LLM 設定 */}
            <div className="lr-admin-llm-section">
              <p className="lr-admin-section-title">LLM 設定</p>
              <label className="lr-admin-label">OpenAI API Key</label>
              <div className="lr-admin-key-row">
                <input
                  type="password"
                  className="lr-admin-input"
                  placeholder="sk-..."
                  value={llmApiKeyInput}
                  onChange={e => setLlmApiKeyInput(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
                <button className="lr-admin-save-btn" onClick={() => setLlmApiKey(llmApiKeyInput.trim())}>
                  {llmApiKey ? '更新' : '儲存'}
                </button>
                {llmApiKey && (
                  <button className="lr-admin-clear-btn" onClick={() => { setLlmApiKey(''); setLlmApiKeyInput('') }}>
                    清除
                  </button>
                )}
              </div>
              {llmApiKey && <p className="lr-admin-key-hint">✓ 已設定（僅存於記憶體）</p>}
              <label className="lr-admin-label">
                Temperature <span className="lr-admin-temp-val">{llmTemperature.toFixed(1)}</span>
              </label>
              <input
                type="range" min="0" max="1.5" step="0.1"
                className="lr-admin-range"
                value={llmTemperature}
                onChange={e => setLlmTemperature(Number(e.target.value))}
              />
              <div className="lr-admin-range-labels">
                <span>嚴謹 0.0</span><span>1.5 創意</span>
              </div>
            </div>

            <div>
              <p className="lr-admin-section-title" style={{ marginBottom: '10px' }}>貼上 JSON 匯入主題</p>
              <p className="lr-admin-hint" style={{ marginBottom: '10px' }}>
                將 LLM 生成的 JSON 貼入下方，點擊「匯入」即可建立新主題。
              </p>
              <textarea
                className="lr-admin-textarea"
                placeholder={'{\n  "id": "my-topic",\n  "name": "主題名稱",\n  ...\n}'}
                value={pasteJson}
                onChange={e => { setPasteJson(e.target.value); setPasteError(''); setPasteSuccess(false) }}
                onClick={e => e.stopPropagation()}
              />
              {pasteError && <p className="lr-admin-paste-error">{pasteError}</p>}
              {pasteSuccess && <p className="lr-admin-paste-success">✓ 主題已匯入</p>}
              <button
                className="lr-copy-btn"
                style={{ marginTop: '10px' }}
                onClick={handleImportJson}
                disabled={!pasteJson.trim()}
              >
                匯入主題
              </button>
            </div>

            <div>
              <p className="lr-admin-section-title" style={{ marginBottom: '10px' }}>Prompt 生成器</p>
              <input
                className="lr-admin-input"
                placeholder="輸入主題名稱，例如：Docker 容器化"
                value={promptTopicName}
                onChange={e => setPromptTopicName(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
            </div>

            <div>
              <p className="lr-admin-section-title" style={{ marginBottom: '8px' }}>Prompt 預覽</p>
              <textarea
                className="lr-admin-textarea"
                readOnly
                value={getFilledPrompt()}
                onClick={e => e.stopPropagation()}
              />
            </div>

            <button className="lr-copy-btn" onClick={handleCopy}>
              {copied ? '已複製 ✓' : '複製 Prompt'}
            </button>

            <div>
              <p className="lr-admin-section-title">目前主題</p>
              {topics.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>尚無主題</span>
              ) : (
                <div className="lr-admin-topic-list">
                  {topics.map(t => (
                    <div key={t.id} className="lr-admin-topic-row">
                      <span className="lr-admin-topic-name">{t.name}</span>
                      <button
                        className="lr-admin-download-btn"
                        onClick={() => handleDownloadTopic(t.id)}
                        title={`下載「${t.name}」JSON`}
                      ><DownloadIcon /></button>
                      <button
                        className="lr-admin-delete-btn"
                        onClick={() => openDeleteModal(t.id, t.name)}
                        title={`刪除「${t.name}」`}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
