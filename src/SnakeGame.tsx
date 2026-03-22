import { useEffect, useRef, useState, useCallback } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────
const CELL    = 25
const COLS    = 20
const ROWS    = 20
const BASE_MS = 150
const SIZE    = CELL * COLS  // 500

const C = {
  bg:       '#0b0f1a',
  grid:     '#0f1825',
  headFill: '#00ff88',
  headGlow: '#00ff88',
  bodyFill: (t: number) => `hsl(145, 80%, ${50 - t * 18}%)`,
  foodFill: '#ff4466',
  foodGlow: '#ff2244',
}

const KEY_MAP: Record<string, { x: number; y: number }> = {
  ArrowLeft:  { x: -1, y:  0 },
  ArrowRight: { x:  1, y:  0 },
  ArrowUp:    { x:  0, y: -1 },
  ArrowDown:  { x:  0, y:  1 },
  a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
  d: { x:  1, y: 0 }, D: { x:  1, y: 0 },
  w: { x:  0, y:-1 }, W: { x:  0, y:-1 },
  s: { x:  0, y: 1 }, S: { x:  0, y: 1 },
}

// ── Types ────────────────────────────────────────────────────────────────────
type Vec2     = { x: number; y: number }
type Status   = 'start' | 'running' | 'paused' | 'dead'
type Particle = { x: number; y: number; vx: number; vy: number; life: number; r: number }

interface GameState {
  snake:      Vec2[]
  dir:        Vec2
  nextDir:    Vec2
  food:       Vec2
  score:      number
  level:      number
  foodEaten:  number
  particles:  Particle[]
  status:     Status
  lastStep:   number
  animId:     number | null
  best:       number
}

interface Hud {
  score: number
  level: number
  best:  number
}

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  onBack: () => void
}

export default function SnakeGame({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const g = useRef<GameState>({
    snake: [], dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
    food: { x: 0, y: 0 }, score: 0, level: 1, foodEaten: 0,
    particles: [], status: 'start', lastStep: 0, animId: null,
    best: parseInt(localStorage.getItem('snake-best') ?? '0'),
  })

  const [hud, setHud]       = useState<Hud>({ score: 0, level: 1, best: g.current.best })
  const [status, setStatus] = useState<Status>('start')

  // ── Game logic ─────────────────────────────────────────────────────────────
  const spawnFood = useCallback(() => {
    const { snake } = g.current
    let pos: Vec2
    do {
      pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
    } while (snake.some(s => s.x === pos.x && s.y === pos.y))
    g.current.food = pos
  }, [])

  const initGame = useCallback(() => {
    const s = g.current
    s.snake     = [{ x:10,y:10 }, { x:9,y:10 }, { x:8,y:10 }]
    s.dir       = { x: 1, y: 0 }
    s.nextDir   = { x: 1, y: 0 }
    s.score     = 0
    s.level     = 1
    s.foodEaten = 0
    s.particles = []
    spawnFood()
    setHud({ score: 0, level: 1, best: s.best })
  }, [spawnFood])

  // ── Drawing ────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { snake, dir, food, particles } = g.current

    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Grid
    ctx.strokeStyle = C.grid
    ctx.lineWidth = 0.5
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x*CELL, 0); ctx.lineTo(x*CELL, SIZE); ctx.stroke()
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y*CELL); ctx.lineTo(SIZE, y*CELL); ctx.stroke()
    }

    // Food
    const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 180)
    const fcx = food.x * CELL + CELL / 2
    const fcy = food.y * CELL + CELL / 2
    const fr  = (CELL / 2 - 3) * pulse
    ctx.shadowBlur = 18; ctx.shadowColor = C.foodGlow; ctx.fillStyle = C.foodFill
    ctx.beginPath(); ctx.arc(fcx, fcy, fr, 0, Math.PI*2); ctx.fill()
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,180,190,0.6)'
    ctx.beginPath(); ctx.arc(fcx - fr*0.25, fcy - fr*0.25, fr*0.3, 0, Math.PI*2); ctx.fill()

    // Snake
    const len = snake.length
    for (let i = len - 1; i >= 0; i--) {
      const { x, y } = snake[i]
      const t  = i / len
      const px = x*CELL + 1, py = y*CELL + 1, sz = CELL - 2
      ctx.shadowBlur  = i === 0 ? 20 : 8
      ctx.shadowColor = C.headGlow
      ctx.fillStyle   = i === 0 ? C.headFill : C.bodyFill(t)
      ctx.beginPath(); ctx.roundRect(px, py, sz, sz, i === 0 ? 6 : 4); ctx.fill()
      if (i === 0) {
        ctx.shadowBlur = 0; ctx.fillStyle = '#0a0a1a'
        const eo = CELL * 0.22, er = 2.5
        const ex1 = px+sz/2 + dir.y*eo*-1, ey1 = py+sz/2 + dir.x*eo
        const ex2 = px+sz/2 + dir.y*eo,    ey2 = py+sz/2 + dir.x*eo*-1
        const fx = dir.x*eo, fy = dir.y*eo
        ctx.beginPath(); ctx.arc(ex1+fx, ey1+fy, er, 0, Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(ex2+fx, ey2+fy, er, 0, Math.PI*2); ctx.fill()
      }
    }
    ctx.shadowBlur = 0

    // Particles
    for (const p of particles) {
      ctx.globalAlpha = p.life
      ctx.fillStyle = C.foodFill; ctx.shadowBlur = 6; ctx.shadowColor = C.foodGlow
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill()
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0
  }, [])

  // ── Game loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    initGame()

    const stepInterval = () => Math.max(60, BASE_MS - (g.current.level - 1) * 12)

    const emitParticles = (gx: number, gy: number) => {
      const cx = gx*CELL + CELL/2, cy = gy*CELL + CELL/2
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI*2*i)/10
        const speed = 1.5 + Math.random()*2
        g.current.particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
          life: 1.0, r: 2 + Math.random()*2,
        })
      }
    }

    const update = (ts: number) => {
      const s = g.current
      if (ts - s.lastStep < stepInterval()) return
      s.lastStep = ts
      s.dir = { ...s.nextDir }
      const head: Vec2 = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y }

      if (
        head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
        s.snake.slice(0, -1).some(seg => seg.x === head.x && seg.y === head.y)
      ) {
        s.status = 'dead'
        setStatus('dead')
        return
      }

      s.snake.unshift(head)
      if (head.x === s.food.x && head.y === s.food.y) {
        s.score += 10; s.foodEaten++
        if (s.foodEaten % 5 === 0) s.level++
        if (s.score > s.best) { s.best = s.score; localStorage.setItem('snake-best', String(s.best)) }
        emitParticles(s.food.x, s.food.y)
        spawnFood()
        setHud({ score: s.score, level: s.level, best: s.best })
      } else {
        s.snake.pop()
      }
    }

    const loop = (ts: number) => {
      const s = g.current
      if (s.status === 'running') {
        update(ts)
        for (const p of s.particles) {
          p.x += p.vx; p.y += p.vy
          p.vx *= 0.92; p.vy *= 0.92; p.life -= 0.04
        }
        s.particles = s.particles.filter(p => p.life > 0)
      }
      draw()
      s.animId = requestAnimationFrame(loop)
    }

    g.current.animId = requestAnimationFrame(loop)
    return () => { if (g.current.animId !== null) cancelAnimationFrame(g.current.animId) }
  }, [initGame, spawnFood, draw])

  // ── Keyboard input ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const move = KEY_MAP[e.key]
      const s = g.current

      if (move) {
        e.preventDefault()
        if (s.status === 'start' || s.status === 'dead') {
          initGame(); s.status = 'running'; s.lastStep = performance.now()
          setStatus('running')
        } else if (s.status === 'paused') {
          s.status = 'running'; setStatus('running')
        }
        if (s.status === 'running') {
          if (move.x !== -s.dir.x || move.y !== -s.dir.y) s.nextDir = move
        }
        return
      }

      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        if (s.status === 'running') { s.status = 'paused'; setStatus('paused') }
        return
      }

      if ((e.key === 'r' || e.key === 'R' || e.key === 'Enter') &&
          (s.status === 'dead' || s.status === 'paused')) {
        initGame(); s.status = 'running'; s.lastStep = performance.now()
        setStatus('running')
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [initGame])

  // ── Overlay content ────────────────────────────────────────────────────────
  const overlayMap: Record<Exclude<Status, 'running'>, { title: string; score?: string; sub: string }> = {
    start:  { title: 'SNAKE',     sub: '按任意方向鍵開始\nWASD 或 ← ↑ → ↓ 控制方向' },
    paused: { title: 'PAUSED',    sub: '按任意方向鍵繼續' },
    dead:   { title: 'GAME OVER', score: `SCORE: ${hud.score}`, sub: 'R 或 Enter 重新開始' },
  }
  const ov = status !== 'running' ? overlayMap[status] : null

  return (
    <div style={styles.wrapper}>
      {/* 返回首頁按鈕 */}
      <button className="lk-icon-btn lk-back" onClick={onBack} aria-label="返回首頁">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
          <polyline points="9 21 9 12 15 12 15 21" />
        </svg>
      </button>

      <h1 style={styles.title}>SNAKE</h1>

      <div style={styles.hud}>
        <span>SCORE &nbsp;<b style={styles.val}>{hud.score}</b></span>
        <span>BEST &nbsp;<b style={styles.val}>{hud.best}</b></span>
        <span>LEVEL &nbsp;<b style={styles.val}>{hud.level}</b></span>
      </div>

      <div style={styles.canvasWrap}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} style={styles.canvas} />

        {ov && (
          <div style={styles.overlay}>
            <div style={styles.ovTitle}>{ov.title}</div>
            {ov.score && <div style={styles.ovScore}>{ov.score}</div>}
            <div style={styles.ovSub}>
              {ov.sub.split('\n').map((line, i, arr) => (
                <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <p style={styles.hint}>SPACE / P &nbsp;暫停 &nbsp;｜&nbsp; R / Enter &nbsp;重新開始</p>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', position: 'relative',
    background: '#0a0a1a', fontFamily: "'Courier New', Consolas, monospace",
    color: '#e0ffe0', userSelect: 'none',
  },
  title: {
    fontSize: '2.4rem', letterSpacing: '0.5em', paddingLeft: '0.5em',
    color: '#00ff88', marginBottom: 18,
    textShadow: '0 0 20px #00ff88aa, 0 0 40px #00ff8844',
  },
  hud: {
    display: 'flex', gap: 40, marginBottom: 14,
    fontSize: '1rem', letterSpacing: '0.1em', color: '#88ccaa',
  },
  val: { color: '#00ff88' },
  canvasWrap: { position: 'relative', lineHeight: '0' },
  canvas: {
    display: 'block', borderRadius: 8,
    boxShadow: '0 0 0 2px #00ff8833, 0 0 30px #00ff8844, 0 0 60px #00ff8822',
  },
  overlay: {
    position: 'absolute', inset: 0, borderRadius: 8,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 16,
    background: 'rgba(5,10,20,0.82)', backdropFilter: 'blur(4px)',
  },
  ovTitle: {
    fontSize: '2rem', letterSpacing: '0.3em',
    color: '#00ff88', textShadow: '0 0 16px #00ff88',
  },
  ovScore: { fontSize: '1.1rem', color: '#aaffcc', letterSpacing: '0.1em' },
  ovSub: {
    fontSize: '0.85rem', color: '#557766',
    letterSpacing: '0.15em', textAlign: 'center', lineHeight: '1.8',
  },
  hint: {
    marginTop: 14, fontSize: '0.72rem',
    color: '#334455', letterSpacing: '0.1em', textAlign: 'center',
  },
}
