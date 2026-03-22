import { useEffect, useRef, useState, useCallback } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────
const CW = 420
const CH = 540
const COLS = 9
const ROWS = 4
const E_W = 28
const E_H = 20
const E_GAP_X = 14
const E_GAP_Y = 18
const E_START_X = 28
const E_START_Y = 70
const PLAYER_W = 36
const PLAYER_H = 18
const PLAYER_Y = CH - 52
const PLAYER_SPD = 5
const BULLET_SPD = 8
const E_BULLET_SPD = 3.5
const E_MOVE_BASE = 28       // px per step
const E_STEP_INTERVAL = 700  // ms initial

const PURPLE = '#e040fb'
const PURPLE_DIM = '#9c27b0'

type Status = 'start' | 'running' | 'paused' | 'dead' | 'win'
interface Enemy { alive: boolean; x: number; y: number }
interface Bullet { x: number; y: number; enemy: boolean }
interface GState {
  px: number
  enemies: Enemy[][]
  bullets: Bullet[]
  dir: 1 | -1
  lastStep: number
  stepInterval: number
  score: number; lives: number; level: number; best: number
  status: Status
  animId: number | null
  keys: Set<string>
  shootCooldown: number
  eBulletTimer: number
}
interface Hud { score: number; lives: number; level: number; best: number }
interface Props { onBack: () => void }

function newEnemies(level: number): Enemy[][] {
  const offsetX = 0
  const offsetY = (level - 1) * 10
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      alive: true,
      x: E_START_X + c * (E_W + E_GAP_X) + offsetX,
      y: E_START_Y + r * (E_H + E_GAP_Y) + offsetY,
    }))
  )
}

export default function Invaders({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GState>({
    px: CW / 2 - PLAYER_W / 2,
    enemies: newEnemies(1),
    bullets: [],
    dir: 1, lastStep: 0, stepInterval: E_STEP_INTERVAL,
    score: 0, lives: 3, level: 1,
    best: parseInt(localStorage.getItem('invaders-best') ?? '0'),
    status: 'start', animId: null,
    keys: new Set(), shootCooldown: 0, eBulletTimer: 0,
  })
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 3, level: 1, best: g.current.best })
  const [status, setStatus] = useState<Status>('start')

  const initGame = useCallback((level = 1) => {
    const s = g.current
    s.px = CW / 2 - PLAYER_W / 2
    s.enemies = newEnemies(level)
    s.bullets = []
    s.dir = 1; s.lastStep = performance.now()
    s.stepInterval = Math.max(200, E_STEP_INTERVAL - (level - 1) * 80)
    s.score = 0; s.lives = 3; s.level = level
    s.shootCooldown = 0; s.eBulletTimer = 0
    setHud({ score: 0, lives: 3, level, best: s.best })
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { px, enemies, bullets } = g.current

    ctx.fillStyle = '#08010f'; ctx.fillRect(0, 0, CW, CH)

    // Stars (static seed)
    ctx.fillStyle = 'rgba(224,64,251,0.2)'
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 137 + 11) % CW)
      const sy = ((i * 97 + 43) % (CH - 60))
      ctx.fillRect(sx, sy, 1, 1)
    }

    // Enemies
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const e = enemies[r][c]; if (!e.alive) continue
        const rowAlpha = 0.7 + r * 0.075
        ctx.shadowBlur = 10; ctx.shadowColor = PURPLE
        ctx.globalAlpha = rowAlpha
        ctx.fillStyle = PURPLE
        // Body
        ctx.beginPath(); ctx.roundRect(e.x, e.y, E_W, E_H, 3); ctx.fill()
        // Eyes
        ctx.shadowBlur = 0; ctx.globalAlpha = 1
        ctx.fillStyle = '#08010f'
        ctx.fillRect(e.x + 5, e.y + 5, 5, 5)
        ctx.fillRect(e.x + E_W - 10, e.y + 5, 5, 5)
        // Antennae
        ctx.strokeStyle = PURPLE; ctx.lineWidth = 1.5; ctx.globalAlpha = rowAlpha
        ctx.beginPath(); ctx.moveTo(e.x + 7, e.y); ctx.lineTo(e.x + 4, e.y - 5); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(e.x + E_W - 7, e.y); ctx.lineTo(e.x + E_W - 4, e.y - 5); ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
    ctx.shadowBlur = 0

    // Player
    ctx.shadowBlur = 16; ctx.shadowColor = PURPLE
    ctx.fillStyle = PURPLE_DIM
    // Body
    ctx.beginPath(); ctx.roundRect(px, PLAYER_Y + 6, PLAYER_W, PLAYER_H - 6, 4); ctx.fill()
    // Turret
    ctx.fillStyle = PURPLE
    ctx.fillRect(px + PLAYER_W / 2 - 3, PLAYER_Y, 6, 10)
    ctx.shadowBlur = 0

    // Bullets
    for (const b of bullets) {
      ctx.shadowBlur = 8
      ctx.shadowColor = b.enemy ? '#ff4081' : PURPLE
      ctx.fillStyle = b.enemy ? '#ff4081' : PURPLE
      ctx.fillRect(b.x - 2, b.y - 6, 4, 12)
      ctx.shadowBlur = 0
    }

    // Ground line
    ctx.strokeStyle = PURPLE_DIM; ctx.lineWidth = 1; ctx.globalAlpha = 0.3
    ctx.beginPath(); ctx.moveTo(0, CH - 30); ctx.lineTo(CW, CH - 30); ctx.stroke()
    ctx.globalAlpha = 1
  }, [])

  useEffect(() => {
    initGame()
    const loop = (now: number) => {
      const s = g.current
      if (s.status === 'running') {
        // Player move
        if (s.keys.has('ArrowLeft')  || s.keys.has('a') || s.keys.has('A'))
          s.px = Math.max(0, s.px - PLAYER_SPD)
        if (s.keys.has('ArrowRight') || s.keys.has('d') || s.keys.has('D'))
          s.px = Math.min(CW - PLAYER_W, s.px + PLAYER_SPD)

        // Player shoot
        if (s.shootCooldown > 0) s.shootCooldown--
        if ((s.keys.has(' ') || s.keys.has('z') || s.keys.has('Z')) && s.shootCooldown === 0) {
          s.bullets.push({ x: s.px + PLAYER_W / 2, y: PLAYER_Y, enemy: false })
          s.shootCooldown = 18
        }

        // Enemy step
        if (now - s.lastStep > s.stepInterval) {
          s.lastStep = now
          const alive = s.enemies.flat().filter(e => e.alive)
          if (alive.length === 0) {
            s.level++
            s.enemies = newEnemies(s.level)
            s.stepInterval = Math.max(200, E_STEP_INTERVAL - (s.level - 1) * 80)
            s.bullets = []
            setHud(h => ({ ...h, level: s.level }))
          } else {
            // Check bounds
            const minX = Math.min(...alive.map(e => e.x))
            const maxX = Math.max(...alive.map(e => e.x + E_W))
            let dropDown = false
            if ((s.dir === 1 && maxX + E_MOVE_BASE > CW - 4) ||
                (s.dir === -1 && minX - E_MOVE_BASE < 4)) {
              dropDown = true
              s.dir = s.dir === 1 ? -1 : 1
            }
            for (const row of s.enemies)
              for (const e of row) if (e.alive) {
                e.x += s.dir * E_MOVE_BASE
                if (dropDown) e.y += 16
              }

            // Enemy reached bottom
            if (alive.some(e => e.y + E_H >= PLAYER_Y)) {
              if (s.score > s.best) { s.best = s.score; localStorage.setItem('invaders-best', String(s.best)) }
              s.status = 'dead'; setStatus('dead'); setHud(h => ({ ...h, lives: 0, best: s.best }))
            }

            // Random enemy shoot
            s.eBulletTimer++
            const shootInterval = Math.max(20, 60 - (s.level - 1) * 8)
            if (s.eBulletTimer >= shootInterval) {
              s.eBulletTimer = 0
              const shooters = alive.filter((e, _, arr) =>
                !arr.some(o => o.x === e.x && o.y > e.y && o.alive)
              )
              if (shooters.length) {
                const shooter = shooters[Math.floor(Math.random() * shooters.length)]
                s.bullets.push({ x: shooter.x + E_W / 2, y: shooter.y + E_H, enemy: true })
              }
            }
          }
        }

        // Move bullets
        for (const b of s.bullets) b.y += b.enemy ? E_BULLET_SPD : -BULLET_SPD
        s.bullets = s.bullets.filter(b => b.y > -10 && b.y < CH + 10)

        // Bullet hit enemy
        for (const b of s.bullets) {
          if (b.enemy) continue
          for (const row of s.enemies) {
            for (const e of row) {
              if (!e.alive) continue
              if (b.x > e.x && b.x < e.x + E_W && b.y > e.y && b.y < e.y + E_H) {
                e.alive = false; b.y = -9999
                const row_i = s.enemies.findIndex(r => r.includes(e))
                s.score += (ROWS - row_i) * 10 * s.level
                if (s.score > s.best) { s.best = s.score; localStorage.setItem('invaders-best', String(s.best)) }
                setHud(h => ({ ...h, score: s.score, best: s.best }))
              }
            }
          }
        }

        // Enemy bullet hit player
        for (const b of s.bullets) {
          if (!b.enemy) continue
          if (b.x > s.px && b.x < s.px + PLAYER_W && b.y > PLAYER_Y && b.y < PLAYER_Y + PLAYER_H) {
            b.y = 9999; s.lives--
            if (s.lives <= 0) {
              if (s.score > s.best) { s.best = s.score; localStorage.setItem('invaders-best', String(s.best)) }
              s.status = 'dead'; setStatus('dead'); setHud(h => ({ ...h, lives: 0, best: s.best }))
            } else {
              setHud(h => ({ ...h, lives: s.lives }))
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
      const s = g.current; s.keys.add(e.key)
      if (['ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault()
      if (e.key === ' ') {
        if (s.status === 'start' || s.status === 'dead') { initGame(); s.status = 'running'; setStatus('running') }
        else if (s.status === 'paused') { s.status = 'running'; setStatus('running') }
      }
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && s.status === 'running') {
        s.status = 'paused'; setStatus('paused')
      }
    }
    const up = (e: KeyboardEvent) => g.current.keys.delete(e.key)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [initGame])

  const ovMap: Record<Exclude<Status, 'running'>, { title: string; sub: string }> = {
    start:  { title: 'INVADERS',   sub: 'Space 開始\n← → 移動　Space 射擊' },
    paused: { title: 'PAUSED',     sub: 'Space 繼續' },
    dead:   { title: 'GAME OVER',  sub: `SCORE: ${hud.score}\nSpace 重新開始` },
    win:    { title: 'YOU WIN!',   sub: 'Space 下一關' },
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
      <h1 style={st.title}>INVADERS</h1>
      <div style={st.hud}>
        <span>SCORE &nbsp;<b style={st.val}>{hud.score}</b></span>
        <span>BEST &nbsp;<b style={st.val}>{hud.best}</b></span>
        <span>LEVEL &nbsp;<b style={st.val}>{hud.level}</b></span>
        <span style={{ color: PURPLE, letterSpacing: 4 }}>{'♥'.repeat(Math.max(0, hud.lives))}</span>
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
      <p style={st.hint}>← → 移動 &nbsp;｜&nbsp; Space 射擊 &nbsp;｜&nbsp; P 暫停</p>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', position: 'relative',
    background: '#08010f', fontFamily: "'Courier New', Consolas, monospace",
    color: '#f3b8ff', userSelect: 'none', padding: '20px',
  },
  title: {
    fontSize: '2.2rem', letterSpacing: '0.5em', paddingLeft: '0.5em',
    color: PURPLE, marginBottom: 16,
    textShadow: `0 0 20px ${PURPLE}aa, 0 0 40px ${PURPLE}44`,
  },
  hud: { display: 'flex', gap: 32, marginBottom: 14, fontSize: '1rem', letterSpacing: '0.1em', color: '#6a2a80' },
  val: { color: PURPLE },
  canvasWrap: { position: 'relative', lineHeight: '0' },
  canvas: { display: 'block', borderRadius: 4, boxShadow: `0 0 0 1px #1a0a24, 0 0 24px ${PURPLE}22, 0 0 60px ${PURPLE}0a` },
  overlay: {
    position: 'absolute', inset: 0, borderRadius: 4,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
    background: 'rgba(3,1,6,0.88)', backdropFilter: 'blur(4px)',
  },
  ovTitle: { fontSize: '1.8rem', letterSpacing: '0.3em', color: PURPLE, textShadow: `0 0 14px ${PURPLE}` },
  ovSub: { fontSize: '0.85rem', color: '#3a1050', letterSpacing: '0.12em', textAlign: 'center', lineHeight: '2' },
  hint: { marginTop: 14, fontSize: '0.7rem', color: '#1a0a24', letterSpacing: '0.08em', textAlign: 'center' },
}
