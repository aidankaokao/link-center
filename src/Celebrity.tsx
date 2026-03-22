import { useState, useEffect, useRef, useCallback } from 'react'
import AuthUserIcon from './AuthUserIcon'
import './Celebrity.css'
import celebritiesData from './data/celebrities.json'

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface Work {
  year: string
  title: string
  description: string
}

interface Period {
  id: string
  years: string
  title: string
  content: string
  works: Work[]
}

interface Celebrity {
  id: string
  name: string
  dates: string
  tagline: string
  periods: Period[]
}

const celebrities = celebritiesData as Celebrity[]

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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="4" x2="6" y2="20" />
      <line x1="18" y1="4" x2="18" y2="20" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */

interface Props {
  onBack: () => void
}

export default function CelebrityPage({ onBack }: Props) {
  const [isDark, setIsDark] = useState(false)
  const [activePerson, setActivePerson] = useState<string>(celebrities[0].id)
  const [activeSection, setActiveSection] = useState<string>(celebrities[0].periods[0].id)
  const [autoPlay, setAutoPlay] = useState(true)

  const mainRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())
  const autoPlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentPerson = celebrities.find(c => c.id === activePerson) ?? celebrities[0]

  // Keep a ref to currentPerson to avoid stale closures in the interval callback
  const currentPersonRef = useRef(currentPerson)
  useEffect(() => { currentPersonRef.current = currentPerson }, [currentPerson])

  // Keep a ref to activeSection for the same reason
  const activeSectionRef = useRef(activeSection)
  useEffect(() => { activeSectionRef.current = activeSection }, [activeSection])

  /* ── Auto-play helpers ── */

  function clearAutoPlayTimer() {
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current)
      autoPlayTimerRef.current = null
    }
  }

  function scrollToSection(sectionId: string) {
    const el = sectionRefs.current.get(sectionId)
    if (el && mainRef.current) {
      mainRef.current.scrollTo({ top: el.offsetTop - 20, behavior: 'smooth' })
    }
  }

  function advanceSection() {
    const periods = currentPersonRef.current.periods
    const currentId = activeSectionRef.current
    const idx = periods.findIndex(p => p.id === currentId)
    const next = periods[(idx + 1) % periods.length]
    setActiveSection(next.id)
    scrollToSection(next.id)
  }

  function startAutoPlayTimer() {
    clearAutoPlayTimer()
    autoPlayTimerRef.current = setInterval(advanceSection, 3000)
  }

  /* ── Auto-play effect ── */
  useEffect(() => {
    clearAutoPlayTimer()
    if (autoPlay) startAutoPlayTimer()
    return clearAutoPlayTimer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, activePerson])

  /* ── Person switch ── */
  function handlePersonChange(id: string) {
    if (id === activePerson) return
    setActivePerson(id)
    const person = celebrities.find(c => c.id === id)
    if (person) setActiveSection(person.periods[0].id)
    if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    // useEffect [autoPlay, activePerson] will restart the timer
  }

  /* ── Timeline click → scroll ── */
  function handleTimelineClick(sectionId: string) {
    scrollToSection(sectionId)
    // Reset timer so user gets a full 3s after manual navigation
    if (autoPlay) startAutoPlayTimer()
  }

  /* ── Scroll-to-active observer ── */
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const refs = sectionRefs.current

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id)
        }
      },
      { root: main, threshold: [0.15, 0.4], rootMargin: '-5% 0px -5% 0px' }
    )

    refs.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [activePerson])

  /* ── Entrance animation observer ── */
  const animObserverRef = useRef<IntersectionObserver | null>(null)

  const registerSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el)
    } else {
      sectionRefs.current.delete(id)
    }
  }, [])

  useEffect(() => {
    if (animObserverRef.current) animObserverRef.current.disconnect()

    const main = mainRef.current
    if (!main) return

    sectionRefs.current.forEach(el => el.classList.remove('cb-period--visible'))

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('cb-period--visible')
          }
        })
      },
      { root: main, threshold: 0.1 }
    )

    animObserverRef.current = observer
    sectionRefs.current.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [activePerson])

  return (
    <div className={`cb-root${isDark ? '' : ' light'}`}>

      {/* Top Controls */}
      <div className="cb-top-controls">
        <button className="cb-icon-btn cb-icon-btn--back" onClick={onBack} aria-label="返回首頁">
          <HomeIcon />
        </button>
        <button
          className={`cb-icon-btn${autoPlay ? ' cb-icon-btn--active' : ''}`}
          onClick={() => setAutoPlay(!autoPlay)}
          aria-label={autoPlay ? '停止自動播放' : '開始自動播放'}
          title={autoPlay ? '自動播放中（點擊暫停）' : '已暫停（點擊播放）'}
        >
          {autoPlay ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          className="cb-icon-btn"
          onClick={() => setIsDark(!isDark)}
          aria-label={isDark ? '切換為亮色模式' : '切換為深色模式'}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
        <AuthUserIcon />
      </div>

      {/* Left: Person Selector */}
      <div className="cb-person-panel">
        {celebrities.map(c => (
          <button
            key={c.id}
            className={`cb-person-btn${activePerson === c.id ? ' cb-person-btn--active' : ''}`}
            onClick={() => handlePersonChange(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Main Scrollable Content */}
      <div className="cb-layout">
        <div className="cb-main" ref={mainRef}>

          {/* Hero */}
          <div className="cb-hero">
            <p className="cb-hero-eyebrow">民國人物傳</p>
            <h1 className="cb-hero-name">{currentPerson.name}</h1>
            <p className="cb-hero-dates">{currentPerson.dates}</p>
            <div className="cb-hero-divider" />
            <p className="cb-hero-tagline">{currentPerson.tagline}</p>
          </div>

          {/* Periods */}
          <div className="cb-periods">
            {currentPerson.periods.map(period => (
              <div
                key={period.id}
                id={period.id}
                className="cb-period"
                ref={el => registerSectionRef(period.id, el)}
              >
                <div className="cb-period-header">
                  <span className="cb-period-years">{period.years}</span>
                  <h2 className="cb-period-title">{period.title}</h2>
                </div>
                <p className="cb-period-content">{period.content}</p>

                {period.works.length > 0 && (
                  <div className="cb-works">
                    <p className="cb-works-heading">重要著作 / 事蹟</p>
                    <table className="cb-works-table">
                      <thead>
                        <tr>
                          <th>年份</th>
                          <th>著作 / 事蹟</th>
                          <th>說明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {period.works.map((work, i) => (
                          <tr key={i}>
                            <td>{work.year}</td>
                            <td>{work.title}</td>
                            <td>{work.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Right: Timeline */}
      <div className="cb-timeline">
        <div className="cb-tl-track" />
        {currentPerson.periods.map(period => (
          <div
            key={period.id}
            className={`cb-tl-item${activeSection === period.id ? ' cb-tl-item--active' : ''}`}
            onClick={() => handleTimelineClick(period.id)}
            title={period.title}
          >
            <span className="cb-tl-label">{period.years}</span>
            <span className="cb-tl-dot" />
          </div>
        ))}
      </div>

    </div>
  )
}
