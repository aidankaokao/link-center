import { useEffect, useRef, useState, useCallback } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────
const COLS    = 10
const ROWS    = 20
const CELL    = 28
const W       = COLS * CELL  // 280
const H       = ROWS * CELL  // 560
const NEXT_SZ = 4            // preview grid size

// Colors: cyan theme (distinct from Snake's green)
const C = {
  bg:     '#080c18',
  grid:   '#0d1226',
  ghost:  'rgba(100,200,255,0.15)',
  text:   '#8ab4cc',
  border: '#1a2a44',
}

// Tetromino definitions [rotations][rows][cols]
const PIECES: { cells: number[][][]; color: string; glow: string }[] = [
  // I — cyan
  { color: '#00e5ff', glow: '#00b8d4',
    cells: [
      [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
      [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
      [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
    ],
  },
  // O — yellow
  { color: '#ffe500', glow: '#c8b400',
    cells: [
      [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    ],
  },
  // T — magenta
  { color: '#e040fb', glow: '#aa00cc',
    cells: [
      [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
      [[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],
      [[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
    ],
  },
  // S — green
  { color: '#69ff47', glow: '#00c853',
    cells: [
      [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],
      [[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],
      [[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
    ],
  },
  // Z — red
  { color: '#ff1744', glow: '#b71c1c',
    cells: [
      [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
      [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],
      [[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]],
    ],
  },
  // J — blue
  { color: '#448aff', glow: '#1565c0',
    cells: [
      [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
      [[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]],
    ],
  },
  // L — orange
  { color: '#ff9100', glow: '#e65100',
    cells: [
      [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],
      [[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],
      [[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
    ],
  },
]

// ── Types ─────────────────────────────────────────────────────────────────
type Status = 'start' | 'running' | 'paused' | 'dead'

interface Piece { type: number; rot: number; x: number; y: number }

interface GameState {
  board:     (number | null)[][]  // null=empty, 0-6=piece type
  current:   Piece
  next:      number
  bag:       number[]
  score:     number
  level:     number
  lines:     number
  best:      number
  status:    Status
  lastDrop:  number
  animId:    number | null
  lockTimer: number | null
}

interface Hud { score: number; level: number; lines: number; best: number; next: number }

interface Props { onBack: () => void }

// ── Helpers ──────────────────────────────────────────────────────────────
function newBoard(): (number | null)[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null))
}

function newBag(): number[] {
  const bag = [0, 1, 2, 3, 4, 5, 6]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

function cells(p: Piece): number[][] { return PIECES[p.type].cells[p.rot] }

function pieceBlocks(p: Piece): { r: number; c: number }[] {
  const result: { r: number; c: number }[] = []
  cells(p).forEach((row, dr) => row.forEach((v, dc) => {
    if (v) result.push({ r: p.y + dr, c: p.x + dc })
  }))
  return result
}

function collides(board: (number | null)[][], p: Piece): boolean {
  return pieceBlocks(p).some(({ r, c }) =>
    r >= ROWS || c < 0 || c >= COLS || (r >= 0 && board[r][c] !== null)
  )
}

function spawnPiece(type: number): Piece {
  return { type, rot: 0, x: COLS / 2 - 2, y: -1 }
}

function dropInterval(level: number): number {
  return Math.max(100, 800 - (level - 1) * 60)
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Tetris({ onBack }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const nextRef    = useRef<HTMLCanvasElement>(null)

  const g = useRef<GameState>({
    board: newBoard(), current: spawnPiece(0), next: 1, bag: newBag(),
    score: 0, level: 1, lines: 0,
    best: parseInt(localStorage.getItem('tetris-best') ?? '0'),
    status: 'start', lastDrop: 0, animId: null, lockTimer: null,
  })

  const [hud, setHud] = useState<Hud>({ score: 0, level: 1, lines: 0, best: g.current.best, next: 1 })
  const [status, setStatus] = useState<Status>('start')

  // ── Bag / spawn ─────────────────────────────────────────────────────────
  const nextFromBag = useCallback(() => {
    const s = g.current
    if (s.bag.length === 0) s.bag = newBag()
    return s.bag.shift()!
  }, [])

  // ── Locking ─────────────────────────────────────────────────────────────
  const lockAndSpawn = useCallback(() => {
    const s = g.current
    // Place piece
    pieceBlocks(s.current).forEach(({ r, c }) => {
      if (r >= 0) s.board[r][c] = s.current.type
    })
    // Clear lines
    let cleared = 0
    for (let r = ROWS - 1; r >= 0; r--) {
      if (s.board[r].every(v => v !== null)) {
        s.board.splice(r, 1)
        s.board.unshift(Array(COLS).fill(null))
        cleared++; r++ // re-check same row index
      }
    }
    if (cleared > 0) {
      const pts = [0, 100, 300, 500, 800][cleared] * s.level
      s.score += pts; s.lines += cleared
      s.level = Math.floor(s.lines / 10) + 1
      if (s.score > s.best) { s.best = s.score; localStorage.setItem('tetris-best', String(s.best)) }
    }
    // Spawn next
    const nextType = nextFromBag()
    s.current = spawnPiece(s.next)
    s.next = nextType
    if (collides(s.board, s.current)) {
      s.status = 'dead'; setStatus('dead')
      return
    }
    s.lastDrop = performance.now()
    setHud({ score: s.score, level: s.level, lines: s.lines, best: s.best, next: s.next })
  }, [nextFromBag])

  // ── Drawing ──────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const s = g.current

    // Background
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H)

    // Grid lines
    ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke()
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke()
    }

    // Board cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = s.board[r][c]
        if (t === null) continue
        drawCell(ctx, c, r, PIECES[t].color, PIECES[t].glow)
      }
    }

    // Ghost piece
    let ghost = { ...s.current }
    while (!collides(s.board, { ...ghost, y: ghost.y + 1 })) ghost.y++
    if (ghost.y !== s.current.y) {
      pieceBlocks(ghost).forEach(({ r, c }) => {
        if (r < 0) return
        ctx.fillStyle = C.ghost
        ctx.beginPath(); ctx.roundRect(c*CELL+1, r*CELL+1, CELL-2, CELL-2, 3); ctx.fill()
      })
    }

    // Current piece
    pieceBlocks(s.current).forEach(({ r, c }) => {
      if (r < 0) return
      drawCell(ctx, c, r, PIECES[s.current.type].color, PIECES[s.current.type].glow)
    })

    // Next preview
    const nc = nextRef.current
    if (nc) {
      const nx = nc.getContext('2d')!
      const ns = NEXT_SZ * CELL
      nx.fillStyle = C.bg; nx.fillRect(0, 0, ns, ns)
      const np: Piece = { type: s.next, rot: 0, x: 0, y: 0 }
      pieceBlocks(np).forEach(({ r, c }) => {
        drawCellCtx(nx, c, r, CELL, PIECES[s.next].color, PIECES[s.next].glow)
      })
    }
  }, [])

  function drawCell(ctx: CanvasRenderingContext2D, c: number, r: number, color: string, glow: string) {
    drawCellCtx(ctx, c, r, CELL, color, glow)
  }

  function drawCellCtx(ctx: CanvasRenderingContext2D, c: number, r: number, sz: number, color: string, glow: string) {
    ctx.shadowBlur = 10; ctx.shadowColor = glow
    ctx.fillStyle = color
    ctx.beginPath(); ctx.roundRect(c*sz+1, r*sz+1, sz-2, sz-2, 3); ctx.fill()
    // highlight
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath(); ctx.roundRect(c*sz+2, r*sz+2, sz-4, 5, [2,2,0,0]); ctx.fill()
    ctx.shadowBlur = 0
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    const s = g.current
    s.bag     = newBag()
    s.board   = newBoard()
    s.current = spawnPiece(s.bag.shift()!)
    s.next    = s.bag.shift()!
    s.score   = 0; s.level = 1; s.lines = 0
    s.lastDrop = performance.now()
    setHud({ score: 0, level: 1, lines: 0, best: s.best, next: s.next })
  }, [])

  // ── Game loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    initGame()

    const loop = (ts: number) => {
      const s = g.current
      if (s.status === 'running') {
        if (ts - s.lastDrop >= dropInterval(s.level)) {
          s.lastDrop = ts
          const moved = { ...s.current, y: s.current.y + 1 }
          if (!collides(s.board, moved)) {
            s.current = moved
          } else {
            lockAndSpawn()
          }
        }
      }
      draw()
      s.animId = requestAnimationFrame(loop)
    }

    g.current.animId = requestAnimationFrame(loop)
    return () => { if (g.current.animId !== null) cancelAnimationFrame(g.current.animId) }
  }, [initGame, lockAndSpawn, draw])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const s = g.current

      if (e.key === ' ' && (s.status === 'start' || s.status === 'dead')) {
        e.preventDefault()
        initGame(); s.status = 'running'; s.lastDrop = performance.now()
        setStatus('running'); return
      }

      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault()
        if (s.status === 'running') { s.status = 'paused'; setStatus('paused') }
        else if (s.status === 'paused') { s.status = 'running'; s.lastDrop = performance.now(); setStatus('running') }
        return
      }

      if (s.status !== 'running') return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const m = { ...s.current, x: s.current.x - 1 }
        if (!collides(s.board, m)) s.current = m
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const m = { ...s.current, x: s.current.x + 1 }
        if (!collides(s.board, m)) s.current = m
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const m = { ...s.current, y: s.current.y + 1 }
        if (!collides(s.board, m)) { s.current = m; s.lastDrop = performance.now() }
        else lockAndSpawn()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const rotated = { ...s.current, rot: (s.current.rot + 1) % 4 }
        // wall kicks: try 0, -1, +1, -2, +2
        for (const kick of [0, -1, 1, -2, 2]) {
          const kicked = { ...rotated, x: rotated.x + kick }
          if (!collides(s.board, kicked)) { s.current = kicked; break }
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        // Hard drop
        while (!collides(s.board, { ...s.current, y: s.current.y + 1 })) {
          s.current = { ...s.current, y: s.current.y + 1 }
        }
        lockAndSpawn()
      }
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [initGame, lockAndSpawn])

  // ── Overlay ────────────────────────────────────────────────────────────
  const ovMap: Record<Exclude<Status, 'running'>, { title: string; sub: string }> = {
    start:  { title: 'TETRIS',    sub: 'Space 開始' },
    paused: { title: 'PAUSED',    sub: 'P / Esc 繼續' },
    dead:   { title: 'GAME OVER', sub: `SCORE: ${hud.score}\nSpace 重新開始` },
  }
  const ov = status !== 'running' ? ovMap[status] : null

  return (
    <div style={s.wrapper}>
      {/* 返回遊戲中心 */}
      <button className="lk-icon-btn lk-back" onClick={onBack} aria-label="返回遊戲中心">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
          <polyline points="9 21 9 12 15 12 15 21" />
        </svg>
      </button>

      <h1 style={s.title}>TETRIS</h1>

      <div style={s.layout}>
        {/* Board */}
        <div style={s.canvasWrap}>
          <canvas ref={canvasRef} width={W} height={H} style={s.canvas} />
          {ov && (
            <div style={s.overlay}>
              <div style={s.ovTitle}>{ov.title}</div>
              <div style={s.ovSub}>
                {ov.sub.split('\n').map((line, i, arr) => (
                  <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div style={s.panel}>
          <div style={s.panelBlock}>
            <div style={s.panelLabel}>NEXT</div>
            <canvas ref={nextRef} width={NEXT_SZ * CELL} height={NEXT_SZ * CELL} style={s.nextCanvas} />
          </div>
          <div style={s.panelBlock}>
            <div style={s.panelLabel}>SCORE</div>
            <div style={s.panelVal}>{hud.score.toLocaleString()}</div>
          </div>
          <div style={s.panelBlock}>
            <div style={s.panelLabel}>BEST</div>
            <div style={s.panelVal}>{hud.best.toLocaleString()}</div>
          </div>
          <div style={s.panelBlock}>
            <div style={s.panelLabel}>LEVEL</div>
            <div style={s.panelVal}>{hud.level}</div>
          </div>
          <div style={s.panelBlock}>
            <div style={s.panelLabel}>LINES</div>
            <div style={s.panelVal}>{hud.lines}</div>
          </div>
        </div>
      </div>

      <p style={s.hint}>← → 移動 &nbsp;｜&nbsp; ↑ 旋轉 &nbsp;｜&nbsp; ↓ 軟降 &nbsp;｜&nbsp; Space 硬降 &nbsp;｜&nbsp; P 暫停</p>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', position: 'relative',
    background: '#060a14', fontFamily: "'Courier New', Consolas, monospace",
    color: '#c8e0f0', userSelect: 'none', padding: '20px',
  },
  title: {
    fontSize: '2.2rem', letterSpacing: '0.5em', paddingLeft: '0.5em',
    color: '#00e5ff', marginBottom: 16,
    textShadow: '0 0 20px #00e5ffaa, 0 0 40px #00e5ff44',
  },
  layout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  canvasWrap: { position: 'relative', lineHeight: '0' },
  canvas: {
    display: 'block', borderRadius: 4,
    boxShadow: '0 0 0 1px #1a2a44, 0 0 24px #00e5ff22, 0 0 60px #00e5ff0a',
  },
  overlay: {
    position: 'absolute', inset: 0, borderRadius: 4,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 14,
    background: 'rgba(4,8,18,0.85)', backdropFilter: 'blur(4px)',
  },
  ovTitle: {
    fontSize: '1.8rem', letterSpacing: '0.3em',
    color: '#00e5ff', textShadow: '0 0 14px #00e5ff',
  },
  ovSub: {
    fontSize: '0.85rem', color: '#4a7a99',
    letterSpacing: '0.12em', textAlign: 'center', lineHeight: '2',
  },
  panel: {
    display: 'flex', flexDirection: 'column', gap: 16,
    width: NEXT_SZ * CELL + 24,
  },
  panelBlock: {
    background: '#0d1226', border: '1px solid #1a2a44',
    borderRadius: 6, padding: '10px 12px',
  },
  panelLabel: {
    fontSize: '0.65rem', letterSpacing: '0.25em',
    color: '#4a7a99', marginBottom: 8,
  },
  panelVal: { fontSize: '1.1rem', color: '#00e5ff', letterSpacing: '0.08em' },
  nextCanvas: { display: 'block', background: 'transparent' },
  hint: {
    marginTop: 14, fontSize: '0.7rem',
    color: '#2a4455', letterSpacing: '0.08em', textAlign: 'center',
  },
}
