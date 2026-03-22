import { useEffect, useRef, useState, useCallback } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────
const CW = 420
const CH = 520
const PADDLE_W = 80
const PADDLE_H = 12
const PADDLE_Y = CH - 52
const BALL_R   = 7
const COLS = 8
const ROWS = 5
const B_GAP = 4
const B_W   = (CW - B_GAP * (COLS + 1)) / COLS
const B_H   = 20
const B_TOP = 70

const ROW_COLORS = ['#ff4081','#ff6b35','#ffab00','#76ff03','#00e5ff']
const ROW_GLOWS  = ['#f50057','#e64a19','ff8f00','#64dd17','#00b8d4']

function newBricks(): boolean[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(true))
}
function baseSpeed(level: number) { return 3.8 + (level - 1) * 0.45 }

// ── Types ──────────────────────────────────────────────────────────────────
type Status = 'start' | 'running' | 'paused' | 'dead'
interface GState {
  px: number; bx: number; by: number; vx: number; vy: number
  bricks: boolean[][]; score: number; lives: number; level: number
  best: number; status: Status; animId: number | null; keys: Set<string>
}
interface Hud { score: number; lives: number; level: number; best: number }
interface Props { onBack: () => void }

// ── Component ──────────────────────────────────────────────────────────────
export default function Breakout({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GState>({
    px: CW / 2 - PADDLE_W / 2, bx: CW / 2, by: PADDLE_Y - BALL_R - 2,
    vx: 3.5, vy: -3.5, bricks: newBricks(),
    score: 0, lives: 3, level: 1,
    best: parseInt(localStorage.getItem('breakout-best') ?? '0'),
    status: 'start', animId: null, keys: new Set(),
  })
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 3, level: 1, best: g.current.best })
  const [status, setStatus] = useState<Status>('start')

  const resetBall = useCallback((level: number) => {
    const spd = baseSpeed(level)
    const sign = Math.random() > 0.5 ? 1 : -1
    Object.assign(g.current, {
      px: CW / 2 - PADDLE_W / 2,
      bx: CW / 2, by: PADDLE_Y - BALL_R - 2,
      vx: spd * sign * 0.7, vy: -spd,
    })
  }, [])

  const initGame = useCallback(() => {
    const s = g.current
    s.bricks = newBricks(); s.score = 0; s.lives = 3; s.level = 1
    resetBall(1)
    setHud({ score: 0, lives: 3, level: 1, best: s.best })
  }, [resetBall])

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { px, bx, by, bricks } = g.current

    ctx.fillStyle = '#080c18'; ctx.fillRect(0, 0, CW, CH)

    // Bricks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!bricks[r][c]) continue
        const x = B_GAP + c * (B_W + B_GAP)
        const y = B_TOP + r * (B_H + B_GAP)
        ctx.shadowBlur = 8; ctx.shadowColor = ROW_GLOWS[r]
        ctx.fillStyle = ROW_COLORS[r]
        ctx.beginPath(); ctx.roundRect(x, y, B_W, B_H, 3); ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.beginPath(); ctx.roundRect(x + 2, y + 2, B_W - 4, 5, [2, 2, 0, 0]); ctx.fill()
      }
    }

    // Paddle
    ctx.shadowBlur = 14; ctx.shadowColor = '#ff6b35'
    ctx.fillStyle = '#ff6b35'
    ctx.beginPath(); ctx.roundRect(px, PADDLE_Y, PADDLE_W, PADDLE_H, 6); ctx.fill()

    // Ball
    ctx.shadowColor = '#ffab00'
    ctx.fillStyle = '#ffab00'
    ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
  }, [])

  useEffect(() => {
    initGame()
    const loop = () => {
      const s = g.current
      if (s.status === 'running') {
        const spd = 7
        if (s.keys.has('ArrowLeft')  || s.keys.has('a') || s.keys.has('A'))
          s.px = Math.max(0, s.px - spd)
        if (s.keys.has('ArrowRight') || s.keys.has('d') || s.keys.has('D'))
          s.px = Math.min(CW - PADDLE_W, s.px + spd)

        s.bx += s.vx; s.by += s.vy

        // Wall bounces
        if (s.bx - BALL_R < 0) { s.bx = BALL_R; s.vx = Math.abs(s.vx) }
        if (s.bx + BALL_R > CW) { s.bx = CW - BALL_R; s.vx = -Math.abs(s.vx) }
        if (s.by - BALL_R < 0) { s.by = BALL_R; s.vy = Math.abs(s.vy) }

        // Paddle hit
        if (s.vy > 0 &&
            s.by + BALL_R >= PADDLE_Y &&
            s.by - BALL_R <= PADDLE_Y + PADDLE_H &&
            s.bx >= s.px - BALL_R && s.bx <= s.px + PADDLE_W + BALL_R) {
          const hit = (s.bx - s.px) / PADDLE_W - 0.5
          const spd2 = baseSpeed(s.level)
          const angle = hit * Math.PI * 0.55
          s.vx = Math.sin(angle) * spd2 * 1.25
          s.vy = -Math.cos(angle) * spd2 * 1.25
          s.by = PADDLE_Y - BALL_R
        }

        // Fall below
        if (s.by - BALL_R > CH) {
          s.lives--
          if (s.lives <= 0) {
            if (s.score > s.best) { s.best = s.score; localStorage.setItem('breakout-best', String(s.best)) }
            s.status = 'dead'; setStatus('dead'); setHud(h => ({ ...h, lives: 0, best: s.best }))
          } else {
            resetBall(s.level); setHud(h => ({ ...h, lives: s.lives }))
          }
        }

        // Brick collisions
        outer: for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (!s.bricks[r][c]) continue
            const bx = B_GAP + c * (B_W + B_GAP)
            const by = B_TOP + r * (B_H + B_GAP)
            const nearX = Math.max(bx, Math.min(s.bx, bx + B_W))
            const nearY = Math.max(by, Math.min(s.by, by + B_H))
            if ((s.bx - nearX) ** 2 + (s.by - nearY) ** 2 < BALL_R ** 2) {
              s.bricks[r][c] = false
              s.score += (ROWS - r) * 10 * s.level
              const overlapX = Math.min(Math.abs(s.bx - bx), Math.abs(s.bx - (bx + B_W)))
              const overlapY = Math.min(Math.abs(s.by - by), Math.abs(s.by - (by + B_H)))
              if (overlapX < overlapY) s.vx = -s.vx; else s.vy = -s.vy
              if (s.score > s.best) { s.best = s.score; localStorage.setItem('breakout-best', String(s.best)) }
              setHud(h => ({ ...h, score: s.score, best: s.best }))
              if (s.bricks.every(row => row.every(b => !b))) {
                s.level++; s.bricks = newBricks()
                resetBall(s.level); setHud(h => ({ ...h, level: s.level }))
              }
              break outer
            }
          }
        }
      }
      draw()
      s.animId = requestAnimationFrame(loop)
    }
    g.current.animId = requestAnimationFrame(loop)
    return () => { if (g.current.animId !== null) cancelAnimationFrame(g.current.animId) }
  }, [initGame, resetBall, draw])

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = g.current; s.keys.add(e.key)
      if (['ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault()
      if (e.key === ' ') {
        e.preventDefault()
        if (s.status === 'start' || s.status === 'dead') { initGame(); s.status = 'running'; setStatus('running') }
        else if (s.status === 'running') { s.status = 'paused'; setStatus('paused') }
        else if (s.status === 'paused') { s.status = 'running'; setStatus('running') }
      }
    }
    const up = (e: KeyboardEvent) => g.current.keys.delete(e.key)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [initGame])

  // Mouse control
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const move = (e: MouseEvent) => {
      if (g.current.status !== 'running') return
      const rect = canvas.getBoundingClientRect()
      const mx = (e.clientX - rect.left) * (CW / rect.width)
      g.current.px = Math.max(0, Math.min(CW - PADDLE_W, mx - PADDLE_W / 2))
    }
    canvas.addEventListener('mousemove', move)
    return () => canvas.removeEventListener('mousemove', move)
  }, [])

  const ovMap: Record<Exclude<Status, 'running'>, { title: string; sub: string }> = {
    start:  { title: 'BREAKOUT',  sub: 'Space 開始\n← → 或滑鼠移動板子' },
    paused: { title: 'PAUSED',    sub: 'Space 繼續' },
    dead:   { title: 'GAME OVER', sub: `SCORE: ${hud.score}\nSpace 重新開始` },
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
      <h1 style={st.title}>BREAKOUT</h1>
      <div style={st.hud}>
        <span>SCORE &nbsp;<b style={st.val}>{hud.score}</b></span>
        <span>BEST &nbsp;<b style={st.val}>{hud.best}</b></span>
        <span>LEVEL &nbsp;<b style={st.val}>{hud.level}</b></span>
        <span style={{ color: '#ff6b35', letterSpacing: 4 }}>{'♥'.repeat(Math.max(0, hud.lives))}</span>
      </div>
      <div style={st.canvasWrap}>
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
      <p style={st.hint}>← → 或滑鼠 移動 &nbsp;｜&nbsp; Space 暫停</p>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', position: 'relative',
    background: '#08070a', fontFamily: "'Courier New', Consolas, monospace",
    color: '#ffd5c0', userSelect: 'none', padding: '20px',
  },
  title: {
    fontSize: '2.2rem', letterSpacing: '0.5em', paddingLeft: '0.5em',
    color: '#ff6b35', marginBottom: 16,
    textShadow: '0 0 20px #ff6b35aa, 0 0 40px #ff6b3544',
  },
  hud: { display: 'flex', gap: 32, marginBottom: 14, fontSize: '1rem', letterSpacing: '0.1em', color: '#88664a' },
  val: { color: '#ff6b35' },
  canvasWrap: { position: 'relative', lineHeight: '0' },
  canvas: { display: 'block', borderRadius: 4, boxShadow: '0 0 0 1px #2a1a0a, 0 0 24px #ff6b3522, 0 0 60px #ff6b350a' },
  overlay: {
    position: 'absolute', inset: 0, borderRadius: 4,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
    background: 'rgba(4,3,2,0.85)', backdropFilter: 'blur(4px)',
  },
  ovTitle: { fontSize: '1.8rem', letterSpacing: '0.3em', color: '#ff6b35', textShadow: '0 0 14px #ff6b35' },
  ovSub: { fontSize: '0.85rem', color: '#4a3020', letterSpacing: '0.12em', textAlign: 'center', lineHeight: '2' },
  hint: { marginTop: 14, fontSize: '0.7rem', color: '#2a1a0a', letterSpacing: '0.08em', textAlign: 'center' },
}
