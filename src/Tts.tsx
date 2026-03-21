import { useState, useRef, useEffect } from 'react'
import './Tts.css'

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface Speaker {
  id: number
  name: string
}

interface Props {
  onBack: () => void
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

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function VoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8"  y1="23" x2="16" y2="23" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
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

function TxtFileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

export default function Tts({ onBack }: Props) {
  const [isDark, setIsDark] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // 模型狀態
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [modelError, setModelError] = useState<string | null>(null)

  // 聲線
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(0)

  // 輸入
  const [text, setText] = useState('')
  const [uploadedText, setUploadedText] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  // 生成狀態
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 音訊
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const prevAudioUrlRef = useRef<string | null>(null)

  // 模型狀態輪詢
  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch('/api/tts/status')
        const data = await res.json()
        if (cancelled) return

        if (data.ready) {
          setModelStatus('ready')
          const speakersRes = await fetch('/api/tts/speakers')
          const speakersData: Speaker[] = await speakersRes.json()
          if (!cancelled) {
            setSpeakers(speakersData)
            setSelectedSpeakerId(speakersData[0]?.id ?? 0)
          }
        } else if (data.error) {
          setModelStatus('error')
          setModelError(data.error)
        } else {
          setTimeout(poll, 1500)
        }
      } catch {
        if (!cancelled) setTimeout(poll, 3000)
      }
    }

    poll()
    return () => { cancelled = true }
  }, [])

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (prevAudioUrlRef.current) URL.revokeObjectURL(prevAudioUrlRef.current)
    }
  }, [])

  const activeText = uploadedText ?? text.trim()

  async function handleGenerate() {
    if (!activeText || generating || modelStatus !== 'ready') return

    // Revoke 舊 URL
    if (prevAudioUrlRef.current) {
      URL.revokeObjectURL(prevAudioUrlRef.current)
      prevAudioUrlRef.current = null
    }
    setAudioUrl(null)
    setAudioDuration(null)
    setError(null)
    setGenerating(true)

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: activeText, speakerId: selectedSpeakerId }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      prevAudioUrlRef.current = url
      setAudioUrl(url)
      setTimeout(() => audioRef.current?.play(), 50)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失敗')
    } finally {
      setGenerating(false)
    }
  }

  function handleDownload() {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `tts-${Date.now()}.wav`
    a.click()
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setUploadedText(content)
    setUploadedFileName(file.name)
    setText('')
    e.target.value = ''
  }

  function handleRemoveFile() {
    setUploadedText(null)
    setUploadedFileName(null)
  }

  const modelStatusText = {
    loading: '模型載入中…',
    ready: '模型已就緒',
    error: `模型錯誤${modelError ? `：${modelError}` : ''}`,
  }[modelStatus]

  return (
    <div className={`tts-root${isDark ? '' : ' light'}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* ── Sidebar ── */}
      <aside className={`tts-sidebar${sidebarOpen ? '' : ' tts-sidebar--collapsed'}`}>
        <div className="sidebar-top">
          {sidebarOpen && <span className="sidebar-brand">聲線設定</span>}
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
            {/* 模型狀態 */}
            <div className={`sidebar-model-status sidebar-model-status--${modelStatus}`}>
              <span className="status-dot" />
              <span>{modelStatusText}</span>
            </div>

            {/* 聲線選單 */}
            <div className="sidebar-section-label">
              <VoiceIcon />
              <span>選擇聲線</span>
            </div>
            <select
              className="sidebar-select"
              value={selectedSpeakerId}
              onChange={e => setSelectedSpeakerId(Number(e.target.value))}
              disabled={modelStatus !== 'ready'}
            >
              {speakers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              {speakers.length === 0 && (
                <option value={0}>載入中…</option>
              )}
            </select>

            <p className="sidebar-hint">
              使用 piper zh_CN-huayan 模型，完全離線運行。
            </p>
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <div className="tts-main">

        {/* Topbar */}
        <div className="tts-topbar">
          <div className="tts-topbar-title">
            <SpeakerIcon />
            <span>文字轉語音</span>
          </div>
          <div className="tts-topbar-actions">
            <button
              className="tts-ctrl-btn"
              onClick={() => setIsDark(!isDark)}
              aria-label={isDark ? '切換為亮色模式' : '切換為深色模式'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="tts-ctrl-btn" onClick={onBack} aria-label="返回首頁">
              <HomeIcon />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="tts-content">

          {/* Card 1：文字輸入 */}
          <div className="tts-card">
            <div className="tts-card-header">
              <span className="tts-card-label">輸入文字</span>
              <button className="tts-upload-btn" onClick={() => fileInputRef.current?.click()}>
                <UploadIcon />
                <span>上傳 TXT</span>
              </button>
            </div>

            {uploadedFileName && (
              <div className="tts-file-badge">
                <TxtFileIcon />
                <span className="tts-file-badge-name">{uploadedFileName}</span>
                <button className="tts-file-badge-remove" onClick={handleRemoveFile} aria-label="移除檔案">
                  <XIcon />
                </button>
              </div>
            )}

            <textarea
              className="tts-textarea"
              value={uploadedText ?? text}
              onChange={e => { if (!uploadedText) setText(e.target.value) }}
              readOnly={!!uploadedText}
              placeholder="在此輸入中文文字，或上傳 TXT 檔案…"
              rows={6}
            />

            <div className="tts-card-footer">
              <span className="tts-char-count">{(uploadedText ?? text).length} 字</span>
            </div>
          </div>

          {/* Card 2：語音輸出 */}
          <div className="tts-card">
            <div className="tts-card-header">
              <span className="tts-card-label">語音輸出</span>
              {audioUrl && (
                <button className="tts-download-btn" onClick={handleDownload}>
                  <DownloadIcon />
                  <span>下載 WAV</span>
                </button>
              )}
            </div>

            <button
              className={`tts-generate-btn${generating ? ' tts-generate-btn--loading' : ''}`}
              onClick={handleGenerate}
              disabled={!activeText || generating || modelStatus !== 'ready'}
            >
              {generating
                ? <><span className="tts-spinner" /><span>生成中…</span></>
                : <><PlayIcon /><span>生成並播放</span></>
              }
            </button>

            {error && <div className="tts-error">⚠ {error}</div>}

            {audioUrl ? (
              <div className="tts-player">
                <audio
                  ref={audioRef}
                  controls
                  src={audioUrl}
                  className="tts-audio-element"
                  onLoadedMetadata={e => {
                    const dur = (e.target as HTMLAudioElement).duration
                    if (isFinite(dur)) setAudioDuration(`${dur.toFixed(1)} 秒`)
                  }}
                />
                {audioDuration && <span className="tts-audio-meta">時長：{audioDuration}</span>}
              </div>
            ) : (
              !error && (
                <div className="tts-player-placeholder">
                  <SpeakerIcon />
                  <p>輸入文字後點擊「生成並播放」以合成語音</p>
                </div>
              )
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
