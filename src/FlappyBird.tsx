import { useEffect, useRef, useState, useCallback } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────
const CW = 360
const CH = 560
const BIRD_X  = 80
const BIRD_R  = 13
const GRAVITY = 0.38
const FLAP    = -7.2
const PIPE_W  = 52
const GAP     = 148
const PIPE_SPEED = 2.4
const PIPE_INTERVAL = 90  // frames

const LIME = '#c6ff00'
const LIME_DIM = '#8ab800'

type Status = 'start' | 'running' | 'dead'
interface GState {
  by: number; bvy: number
  pipes: { x: number; top: number }[]
  score: number; best: number
  frame: number; status: Status
  animId: number | null
}
interface Props { onBack: () => void }

function randomTop() { return 80 + Math.random() * (CH - GAP - 160) }

export default function FlappyBird({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GState>({
    by: CH / 2, bvy: 0,
    pipes: [],
    score: 0,
    best: parseInt(localStorage.getItem('flappy-best') ?? '0'),
    frame: 0, status: 'start', animId: null,
  })
  const [score, setScore] = useState(0)
  const [best, setBest]   = useState(g.current.best)
  const [status, setStatus] = useState<Status>('start')

  const initGame = useCallback(() => {
    const s = g.current
    s.by = CH / 2; s.bvy = 0
    s.pipes = [{ x: CW + 60, top: randomTop() }]
    s.score = 0; s.frame = 0
    setScore(0)
  }, [])

  const flap = useCallback(() => {
    const s = g.current
    if (s.status === 'start') {
      initGame(); s.status = 'running'; setStatus('running')
    } else if (s.status === 'running') {
      s.bvy = FLAP
    } else if (s.status === 'dead') {
      initGame(); s.status = 'running'; setStatus('running')
    }
  }, [initGame])

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { by, pipes, score: sc } = g.current

    // Background
    ctx.fillStyle = '#070d00'; ctx.fillRect(0, 0, CW, CH)

    // Ground line
    ctx.strokeStyle = LIME_DIM; ctx.lineWidth = 1; ctx.setLineDash([4, 6])
    ctx.globalAlpha = 0.3
    ctx.beginPath(); ctx.moveTo(0, CH - 30); ctx.lineTo(CW, CH - 30); ctx.stroke()
    ctx.setLineDash([]); ctx.globalAlpha = 1

    // Pipes
    for (const p of pipes) {
      const bot = p.top + GAP
      // Top pipe
      ctx.shadowBlur = 12; ctx.shadowColor = LIME
      ctx.fillStyle = '#3a5c00'
      ctx.fillRect(p.x, 0, PIPE_W, p.top)
      ctx.fillStyle = LIME
      ctx.fillRect(p.x - 4, p.top - 18, PIPE_W + 8, 18)
      // Bottom pipe
      ctx.fillStyle = '#3a5c00'
      ctx.fillRect(p.x, bot, PIPE_W, CH - bot)
      ctx.fillStyle = LIME
      ctx.fillRect(p.x - 4, bot, PIPE_W + 8, 18)
      ctx.shadowBlur = 0
    }

    // Bird body
    ctx.save()
    ctx.translate(BIRD_X, by)
    const tilt = Math.max(-0.5, Math.min(1.2, g.current.bvy * 0.06))
    ctx.rotate(tilt)
    ctx.shadowBlur = 18; ctx.shadowColor = LIME
    ctx.fillStyle = LIME
    ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2); ctx.fill()
    // Eye
    ctx.shadowBlur = 0
    ctx.fillStyle = '#070d00'
    ctx.beginPath(); ctx.arc(5, -3, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(6, -3.5, 1.5, 0, Math.PI * 2); ctx.fill()
    // Beak
    ctx.fillStyle = '#ffab00'
    ctx.beginPath(); ctx.moveTo(BIRD_R - 2, -1); ctx.lineTo(BIRD_R + 8, 2); ctx.lineTo(BIRD_R - 2, 5); ctx.closePath(); ctx.fill()
    ctx.restore()

    // Score (in-canvas)
    ctx.fillStyle = LIME; ctx.globalAlpha = 0.18
    ctx.font = `bold 72px 'Courier New', monospace`
    ctx.textAlign = 'center'
    ctx.fillText(String(sc), CW / 2, CH / 2 - 40)
    ctx.globalAlpha = 1
  }, [])

  useEffect(() => {
    initGame()
    const loop = () => {
      const s = g.current
      if (s.status === 'running') {
        s.frame++
        // Gravity
        s.bvy += GRAVITY; s.by += s.bvy

        // Spawn pipes
        if (s.frame % PIPE_INTERVAL === 0) {
          s.pipes.push({ x: CW + 10, top: randomTop() })
        }

        // Move pipes + score
        for (const p of s.pipes) {
          p.x -= PIPE_SPEED
          // Score: bird passed pipe center
          if (Math.abs(p.x + PIPE_W / 2 - BIRD_X) < PIPE_SPEED + 0.5 && p.x < BIRD_X) {
            s.score++
            if (s.score > s.best) {
              s.best = s.score
              localStorage.setItem('flappy-best', String(s.best))
              setBest(s.best)
            }
            setScore(s.score)
          }
        }
        s.pipes = s.pipes.filter(p => p.x + PIPE_W > -10)

        // Collision: ceiling / floor
        if (s.by - BIRD_R < 0 || s.by + BIRD_R > CH - 30) {
          s.status = 'dead'; setStatus('dead')
        }

        // Collision: pipes
        for (const p of s.pipes) {
          if (BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W) {
            if (s.by - BIRD_R < p.top || s.by + BIRD_R > p.top + GAP) {
              s.status = 'dead'; setStatus('dead')
            }
          }
        }
      }
      draw()
      s.animId = requestAnimationFrame(loop)
    }
    g.current.animId = requestAnimationFrame(loop)
    return () => { if (g.current.animId !== null) cancelAnimationFrame(g.current.animId) }
  }, [initGame, draw])

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault(); flap()
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [flap])

  const ovMap: Record<Exclude<Status, 'running'>, { title: string; sub: string }> = {
    start: { title: 'FLAPPY BIRD', sub: 'Space 或點擊 開始\n避開水管' },
    dead:  { title: 'GAME OVER',  sub: `SCORE: ${score}\nSpace 或點擊 重試` },
  }
  const ov = status !== 'running' ? ovMap[status] : null

  return (
    <div style={st.wrapper}>
      <button className="lk-icon-btn lk-back" onClick={onBack} aria-label="返回遊戲中心">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
          <polyline points="9 21 9 12 15 12 15 21" />
        </svg>
      </button>
      <h1 style={st.title}>FLAPPY BIRD</h1>
      <div style={st.hud}>
        <span>SCORE &nbsp;<b style={st.val}>{score}</b></span>
        <span>BEST &nbsp;<b style={st.val}>{best}</b></span>
      </div>
      <div style={st.canvasWrap} onClick={flap}>
        <canvas ref={canvasRef} width={CW} height={CH} style={st.canvas} />
        {ov && (
          <div style={st.overlay}>
            <div style={st.ovTitle}>{ov.title}</div>
            <div style={st.ovSub}>
              {ov.sub.split('\n').map((line, i, arr) => (
                <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      <p style={st.hint}>Space / ↑ / 點擊 拍翅</p>
    </div>
  )
}

const LIME_CSS = '#c6ff00'
const st: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', position: 'relative',
    background: '#070d00', fontFamily: "'Courier New', Consolas, monospace",
    color: '#d4ffaa', userSelect: 'none', padding: '20px',
  },
  title: {
    fontSize: '2.2rem', letterSpacing: '0.5em', paddingLeft: '0.5em',
    color: LIME_CSS, marginBottom: 16,
    textShadow: `0 0 20px ${LIME_CSS}aa, 0 0 40px ${LIME_CSS}44`,
  },
  hud: { display: 'flex', gap: 32, marginBottom: 14, fontSize: '1rem', letterSpacing: '0.1em', color: '#5a7a20' },
  val: { color: LIME_CSS },
  canvasWrap: { position: 'relative', lineHeight: '0', cursor: 'pointer' },
  canvas: { display: 'block', borderRadius: 4, boxShadow: `0 0 0 1px #1a2e00, 0 0 24px ${LIME_CSS}22, 0 0 60px ${LIME_CSS}0a` },
  overlay: {
    position: 'absolute', inset: 0, borderRadius: 4,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
    background: 'rgba(2,5,0,0.85)', backdropFilter: 'blur(4px)',
  },
  ovTitle: { fontSize: '1.8rem', letterSpacing: '0.3em', color: LIME_CSS, textShadow: `0 0 14px ${LIME_CSS}` },
  ovSub: { fontSize: '0.85rem', color: '#3a5010', letterSpacing: '0.12em', textAlign: 'center', lineHeight: '2' },
  hint: { marginTop: 14, fontSize: '0.7rem', color: '#1a2e00', letterSpacing: '0.08em', textAlign: 'center' },
}
