import http, { createServer } from 'http'
import https from 'https'
import { createHash, randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import pkg from 'pg'
import bcrypt from 'bcryptjs'
const { Pool } = pkg

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 3000
const DATA_FILE = join(__dirname, 'data', 'links.json')
const DEFAULT_FILE = join(__dirname, 'public', 'links.json')
const DIST_DIR = join(__dirname, 'dist')
const PYTHON_TTS_URL = process.env.PYTHON_TTS_URL || 'http://localhost:14000'
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://filecenter:Fc2026PgLc!@localhost:5432/filecenter'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mjs': 'application/javascript',
}

/* ── Links helpers ── */

function computeEtag(str) {
  return createHash('md5').update(str).digest('hex').slice(0, 8)
}

let linksEtag = (() => {
  try {
    if (existsSync(DATA_FILE))    return computeEtag(readFileSync(DATA_FILE, 'utf-8'))
    if (existsSync(DEFAULT_FILE)) return computeEtag(readFileSync(DEFAULT_FILE, 'utf-8'))
  } catch {}
  return computeEtag('[]')
})()

function readLinks() {
  if (existsSync(DATA_FILE)) return JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  if (existsSync(DEFAULT_FILE)) return JSON.parse(readFileSync(DEFAULT_FILE, 'utf-8'))
  return []
}

function writeLinks(data) {
  mkdirSync(dirname(DATA_FILE), { recursive: true })
  const content = JSON.stringify(data, null, 2)
  writeFileSync(DATA_FILE, content, 'utf-8')
  linksEtag = computeEtag(content)
}

/* ── External fetch helpers (for Papers API) ── */

function fetchExternalText(urlStr, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr)
      const mod = url.protocol === 'https:' ? https : http
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: { 'User-Agent': 'file-center/1.0', 'Accept': 'application/json, text/xml, */*' },
        timeout: timeoutMs,
      }
      const req = mod.request(options, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          req.destroy()
          return fetchExternalText(new URL(res.headers.location, urlStr).href, timeoutMs).then(resolve, reject)
        }
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }))
      })
      req.on('timeout', () => req.destroy(new Error('外部請求逾時')))
      req.on('error', reject)
      req.end()
    } catch (e) { reject(e) }
  })
}

function fetchExternalBinary(urlStr, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr)
      const mod = url.protocol === 'https:' ? https : http
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; file-center/1.0)' },
        timeout: timeoutMs,
      }
      const req = mod.request(options, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          req.destroy()
          return fetchExternalBinary(new URL(res.headers.location, urlStr).href, timeoutMs).then(resolve, reject)
        }
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
      })
      req.on('timeout', () => req.destroy(new Error('PDF 下載逾時')))
      req.on('error', reject)
      req.end()
    } catch (e) { reject(e) }
  })
}

/* ── PostgreSQL setup ── */

const pool = new Pool({ connectionString: DATABASE_URL })

async function initDb() {
  const MAX_RETRIES = 10
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      const client = await pool.connect()
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          token CHAR(64) PRIMARY KEY,
          user_id INT REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP NOT NULL
        )
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_usage (
          username VARCHAR(50) NOT NULL,
          date DATE NOT NULL,
          provider VARCHAR(20) NOT NULL,
          total_tokens INT NOT NULL DEFAULT 0,
          PRIMARY KEY (username, date, provider)
        )
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL
        )
      `)
      await client.query(
        "INSERT INTO settings (key, value) VALUES ('token_retention_days', '365') ON CONFLICT DO NOTHING"
      )
      const adminExists = await client.query("SELECT 1 FROM users WHERE username = 'admin'")
      if (adminExists.rows.length === 0) {
        const hash = await bcrypt.hash('admin', 10)
        await client.query("INSERT INTO users (username, password_hash) VALUES ('admin', $1)", [hash])
        console.log('Admin account created (username: admin, password: admin)')
      }
      client.release()
      console.log('Database schema ready')
      return
    } catch (e) {
      console.error(`DB init attempt ${i}/${MAX_RETRIES} failed: ${e.message}`)
      if (i === MAX_RETRIES) {
        console.error('DB init failed after all retries, exiting')
        process.exit(1)
      }
      await new Promise(r => setTimeout(r, 3000))
    }
  }
}

await initDb()

/* ── Token usage cleanup ── */

async function cleanupTokenUsage() {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'token_retention_days'")
    const days = parseInt(result.rows[0]?.value ?? '365')
    const deleted = await pool.query(
      'DELETE FROM token_usage WHERE date < CURRENT_DATE - $1::int',
      [days]
    )
    if (deleted.rowCount > 0) {
      console.log(`Cleaned up ${deleted.rowCount} old token usage records (retention: ${days} days)`)
    }
  } catch (e) { console.error('Token usage cleanup failed:', e.message) }
}

await cleanupTokenUsage()
setInterval(cleanupTokenUsage, 24 * 60 * 60 * 1000)

/* ── Auth helpers ── */

function parseCookies(req) {
  const cookies = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k) cookies[k.trim()] = decodeURIComponent(v.join('='))
  }
  return cookies
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`)
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  parts.push('Path=/')
  res.setHeader('Set-Cookie', parts.join('; '))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => { try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON')) } })
    req.on('error', reject)
  })
}

async function getSessionUser(req) {
  const token = parseCookies(req).session
  if (!token) return null
  try {
    const result = await pool.query(
      `SELECT u.username FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    )
    if (!result.rows.length) return null
    const { username } = result.rows[0]
    return { username, role: username === 'admin' ? 'admin' : 'user' }
  } catch { return null }
}

/* ── Python TTS proxy helpers ── */

const TIMEOUT_STATUS  = 5_000   // /health、/speakers（ms）
const TIMEOUT_SYNTH   = 120_000  // /tts 合成（ms）

function pyRequest(path, method = 'GET', body = null, timeoutMs = TIMEOUT_STATUS) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PYTHON_TTS_URL)
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
      timeout: timeoutMs,
    }
    const req = http.request(options, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('timeout', () => { req.destroy(new Error(`請求逾時（${timeoutMs / 1000} 秒）`)) })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/* ── HTTP Server ── */

createServer(async (req, res) => {

  /* ── Links API ── */

  if (req.url === '/api/links' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'ETag': `"${linksEtag}"` })
    res.end(JSON.stringify(readLinks()))
    return
  }

  if (req.url === '/api/links' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      const clientEtag = (req.headers['if-match'] ?? '').replace(/"/g, '')
      if (clientEtag && clientEtag !== linksEtag) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'conflict' }))
        return
      }
      writeLinks(JSON.parse(body))
      res.writeHead(200, { 'Content-Type': 'application/json', 'ETag': `"${linksEtag}"` })
      res.end('{"ok":true}')
    })
    return
  }

  /* ── Learner API ── */

  const LEARNER_DIR = join(__dirname, 'data', 'learner')

  const CATEGORIES_FILE = join(LEARNER_DIR, '_categories.json')

  function readCategories() {
    try {
      if (existsSync(CATEGORIES_FILE)) return JSON.parse(readFileSync(CATEGORIES_FILE, 'utf-8'))
    } catch {}
    return []
  }
  function writeCategories(arr) {
    mkdirSync(LEARNER_DIR, { recursive: true })
    writeFileSync(CATEGORIES_FILE, JSON.stringify(arr, null, 2), 'utf-8')
  }

  if (req.url === '/api/learner/categories' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(['未分類', ...readCategories()]))
    return
  }

  if (req.url === '/api/learner/categories' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body)
        if (!name || name === '未分類') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid name' }))
          return
        }
        const cats = readCategories()
        if (cats.includes(name)) {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Already exists' }))
          return
        }
        writeCategories([...cats, name])
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    return
  }

  if (req.url.startsWith('/api/learner/categories/') && req.method === 'DELETE') {
    const name = decodeURIComponent(req.url.slice('/api/learner/categories/'.length))
    if (!name || name === '未分類') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Cannot delete built-in category' }))
      return
    }
    // Check if any topic uses this category
    try {
      if (existsSync(LEARNER_DIR)) {
        const files = readdirSync(LEARNER_DIR).filter(f => f.endsWith('.json') && !f.endsWith('.backup.json') && f !== '_categories.json')
        for (const f of files) {
          try {
            const data = JSON.parse(readFileSync(join(LEARNER_DIR, f), 'utf-8'))
            if (data.category === name) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'category-not-empty' }))
              return
            }
          } catch {}
        }
      }
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Server error' }))
      return
    }
    const cats = readCategories().filter(c => c !== name)
    writeCategories(cats)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.url === '/api/learner' && req.method === 'GET') {
    try {
      if (!existsSync(LEARNER_DIR)) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('[]')
        return
      }
      const files = readdirSync(LEARNER_DIR).filter(f => f.endsWith('.json') && !f.endsWith('.backup.json') && f !== '_categories.json')
      const topics = files.map(f => {
        try {
          const data = JSON.parse(readFileSync(join(LEARNER_DIR, f), 'utf-8'))
          return { id: data.id, name: data.name, description: data.description, category: data.category ?? '未分類' }
        } catch { return null }
      }).filter(Boolean)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(topics))
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end('[]')
    }
    return
  }

  if (req.url.startsWith('/api/learner/') && req.method === 'GET') {
    const id = req.url.slice('/api/learner/'.length).replace(/[^a-zA-Z0-9_-]/g, '')
    const file = join(LEARNER_DIR, `${id}.json`)
    if (!id || id === '_categories' || !existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }
    try {
      const content = readFileSync(file, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(content)
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Read error' }))
    }
    return
  }

  if (req.url === '/api/learner' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const id = (data.id ?? '').replace(/[^a-zA-Z0-9_-]/g, '')
        if (!id || !data.name || !data.levels) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing required fields: id, name, levels' }))
          return
        }
        mkdirSync(LEARNER_DIR, { recursive: true })
        const targetFile = join(LEARNER_DIR, `${id}.json`)
        const content = JSON.stringify(data, null, 2)
        writeFileSync(targetFile, content, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, id }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    return
  }

  if (req.url.startsWith('/api/learner/') && req.method === 'DELETE') {
    const id = req.url.slice('/api/learner/'.length).replace(/[^a-zA-Z0-9_-]/g, '')
    const file = join(LEARNER_DIR, `${id}.json`)
    if (!id || !existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }
    try {
      unlinkSync(file)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Delete failed' }))
    }
    return
  }

  /* ── Auth API ── */

  if (req.url === '/api/auth/me' && req.method === 'GET') {
    const user = await getSessionUser(req)
    if (!user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(user))
    return
  }

  if (req.url === '/api/auth/register' && req.method === 'POST') {
    try {
      const { username, password } = await readBody(req)
      if (!username || !password || username.length < 2 || username.length > 50 || password.length < 4) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '帳號至少 2 字元，密碼至少 4 字元' }))
        return
      }
      if (username === 'admin') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '不可使用此帳號名稱' }))
        return
      }
      const hash = await bcrypt.hash(password, 10)
      await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash])
      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (e) {
      if (e.code === '23505') { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '帳號已存在' })) }
      else { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    }
    return
  }

  if (req.url === '/api/auth/login' && req.method === 'POST') {
    try {
      const { username, password } = await readBody(req)
      const userResult = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username])
      if (!userResult.rows.length || !(await bcrypt.compare(password, userResult.rows[0].password_hash))) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '帳號或密碼錯誤' }))
        return
      }
      const user = userResult.rows[0]
      if (username !== 'admin') {
        const existing = await pool.query('SELECT 1 FROM sessions WHERE user_id = $1 AND expires_at > NOW()', [user.id])
        if (existing.rows.length > 0) {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: '此帳號已在其他地方登入，請先退出後再重新登入' }))
          return
        }
      }
      await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()')
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await pool.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, user.id, expiresAt])
      setCookie(res, 'session', token, { httpOnly: true, sameSite: 'Strict', maxAge: 86400 })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ username, role: username === 'admin' ? 'admin' : 'user' }))
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  if (req.url === '/api/auth/logout' && req.method === 'POST') {
    const token = parseCookies(req).session
    if (token) { try { await pool.query('DELETE FROM sessions WHERE token = $1', [token]) } catch {} }
    setCookie(res, 'session', '', { httpOnly: true, sameSite: 'Strict', maxAge: 0 })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  /* ── Token Usage API ── */

  if (req.url === '/api/token-usage' && req.method === 'POST') {
    const user = await getSessionUser(req)
    if (!user || user.role === 'admin') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return }
    try {
      const { provider, tokens } = await readBody(req)
      if (!provider || !tokens || tokens <= 0) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid data' })); return }
      await pool.query(
        `INSERT INTO token_usage (username, date, provider, total_tokens) VALUES ($1, CURRENT_DATE, $2, $3)
         ON CONFLICT (username, date, provider) DO UPDATE SET total_tokens = token_usage.total_tokens + $3`,
        [user.username, provider, tokens]
      )
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }))
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    return
  }

  if (req.url === '/api/token-usage/me' && req.method === 'GET') {
    const user = await getSessionUser(req)
    if (!user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return }
    try {
      const result = await pool.query(
        'SELECT to_char(date, \'YYYY-MM-DD\') as date, provider, total_tokens FROM token_usage WHERE username = $1 ORDER BY date DESC, provider',
        [user.username]
      )
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result.rows))
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    return
  }

  if (req.url === '/api/token-usage/all' && req.method === 'GET') {
    const user = await getSessionUser(req)
    if (!user || user.role !== 'admin') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return }
    try {
      const result = await pool.query(
        'SELECT username, to_char(date, \'YYYY-MM-DD\') as date, provider, total_tokens FROM token_usage ORDER BY date DESC, username, provider'
      )
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result.rows))
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    return
  }

  /* ── User management API ── */

  if (req.url === '/api/user/password' && req.method === 'PUT') {
    const user = await getSessionUser(req)
    if (!user) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return }
    try {
      const { oldPassword, newPassword } = await readBody(req)
      if (!oldPassword || !newPassword || newPassword.length < 4) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '新密碼至少 4 字元' })); return
      }
      const result = await pool.query('SELECT password_hash FROM users WHERE username = $1', [user.username])
      if (!(await bcrypt.compare(oldPassword, result.rows[0].password_hash))) {
        res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '舊密碼錯誤' })); return
      }
      await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [await bcrypt.hash(newPassword, 10), user.username])
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }))
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    return
  }

  if (req.url === '/api/user/account' && req.method === 'DELETE') {
    const user = await getSessionUser(req)
    if (!user || user.role === 'admin') {
      res.writeHead(user ? 403 : 401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: user ? 'Admin 帳號無法在此刪除' : 'Unauthorized' })); return
    }
    try {
      const { password } = await readBody(req)
      const result = await pool.query('SELECT password_hash FROM users WHERE username = $1', [user.username])
      if (!(await bcrypt.compare(password, result.rows[0].password_hash))) {
        res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '密碼錯誤' })); return
      }
      await pool.query('DELETE FROM users WHERE username = $1', [user.username])
      setCookie(res, 'session', '', { httpOnly: true, sameSite: 'Strict', maxAge: 0 })
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }))
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    return
  }

  /* ── Admin API ── */

  if (req.url === '/api/admin/settings' && req.method === 'GET') {
    const user = await getSessionUser(req)
    if (!user || user.role !== 'admin') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return }
    try {
      const result = await pool.query("SELECT value FROM settings WHERE key = 'token_retention_days'")
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ token_retention_days: parseInt(result.rows[0]?.value ?? '365') }))
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    return
  }

  if (req.url === '/api/admin/settings' && req.method === 'PUT') {
    const user = await getSessionUser(req)
    if (!user || user.role !== 'admin') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return }
    try {
      const { token_retention_days } = await readBody(req)
      if (![30, 60, 90, 180, 365].includes(token_retention_days)) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '無效的保留天數' })); return
      }
      await pool.query(
        "INSERT INTO settings (key, value) VALUES ('token_retention_days', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
        [String(token_retention_days)]
      )
      cleanupTokenUsage()
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }))
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    return
  }

  if (req.url === '/api/admin/users' && req.method === 'GET') {
    const user = await getSessionUser(req)
    if (!user || user.role !== 'admin') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return }
    try {
      const result = await pool.query("SELECT username, to_char(created_at, 'YYYY-MM-DD') as created_at FROM users WHERE username != 'admin' ORDER BY created_at DESC")
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result.rows))
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    return
  }

  if (req.url.startsWith('/api/admin/users/') && req.method === 'DELETE') {
    const user = await getSessionUser(req)
    if (!user || user.role !== 'admin') { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return }
    const targetUsername = decodeURIComponent(req.url.slice('/api/admin/users/'.length))
    if (!targetUsername || targetUsername === 'admin') {
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '無法刪除此帳號' })); return
    }
    try {
      const result = await pool.query('DELETE FROM users WHERE username = $1 RETURNING username', [targetUsername])
      if (!result.rows.length) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '使用者不存在' })); return }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }))
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })) }
    return
  }

  /* ── Papers API ── */

  if (req.url.startsWith('/api/papers/search') && req.method === 'GET') {
    const params = new URL(req.url, 'http://localhost').searchParams
    const topic = (params.get('topic') ?? '').trim()
    const desc  = (params.get('desc')  ?? '').trim()
    if (!topic) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: '缺少 topic 參數' }))
      return
    }
    const query = [topic, desc].filter(Boolean).join(' ')
    const papers = []

    // Semantic Scholar
    try {
      const ssUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,authors,year,abstract,openAccessPdf,url&limit=15`
      const ssRes = await fetchExternalText(ssUrl)
      if (ssRes.status === 200) {
        const data = JSON.parse(ssRes.body)
        for (const p of (data.data ?? [])) {
          if (!p.title) continue
          papers.push({
            id: `ss-${p.paperId}`,
            title: p.title,
            authors: (p.authors ?? []).map(a => a.name).filter(Boolean),
            year: p.year ?? null,
            abstract: p.abstract ?? '',
            pdfUrl: p.openAccessPdf?.url ?? undefined,
            pageUrl: p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
            source: 'semantic_scholar',
          })
        }
      }
    } catch { /* Semantic Scholar unavailable */ }

    // ArXiv
    try {
      const axQuery = encodeURIComponent(`all:${query}`)
      const axUrl = `https://export.arxiv.org/api/query?search_query=${axQuery}&max_results=10&sortBy=relevance`
      const axRes = await fetchExternalText(axUrl)
      if (axRes.status === 200) {
        const xml = axRes.body
        const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? []
        for (const entry of entries) {
          const idMatch      = entry.match(/<id>(.*?)<\/id>/)
          const titleMatch   = entry.match(/<title>([\s\S]*?)<\/title>/)
          const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/)
          const yearMatch    = entry.match(/<published>(\d{4})/)
          const authorMatches = [...entry.matchAll(/<name>(.*?)<\/name>/g)]
          const pdfLinkMatch  = entry.match(/<link[^>]+type="application\/pdf"[^>]+href="([^"]+)"/)

          const pageUrl = (idMatch?.[1] ?? '').trim().replace('http://', 'https://')
          if (!pageUrl || !titleMatch) continue

          const arxivId = pageUrl.replace('https://arxiv.org/abs/', '')
          const pdfUrl  = pdfLinkMatch?.[1] ?? (arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : undefined)
          const title   = titleMatch[1].replace(/\s+/g, ' ').trim()

          // Deduplicate by lowercase title
          const titleLower = title.toLowerCase().trim()
          if (papers.some(p => p.title.toLowerCase().trim() === titleLower)) continue

          papers.push({
            id: `ax-${arxivId || Date.now()}`,
            title,
            authors: authorMatches.map(m => m[1].trim()).filter(Boolean),
            year: yearMatch ? parseInt(yearMatch[1]) : null,
            abstract: (summaryMatch?.[1] ?? '').replace(/\s+/g, ' ').trim(),
            pdfUrl,
            pageUrl,
            source: 'arxiv',
          })
        }
      }
    } catch { /* ArXiv unavailable */ }

    const withPdf    = papers.filter(p => p.pdfUrl)
    const withoutPdf = papers.filter(p => !p.pdfUrl)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ withPdf, withoutPdf }))
    return
  }

  if (req.url.startsWith('/api/papers/pdf') && req.method === 'GET') {
    const pdfUrl = new URL(req.url, 'http://localhost').searchParams.get('url')
    if (!pdfUrl) { res.writeHead(400); res.end('Missing url parameter'); return }
    if (!pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://')) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: '無效的 PDF URL（需為 http 或 https）' }))
      return
    }
    try {
      const result = await fetchExternalBinary(pdfUrl, 30_000)
      if (result.status !== 200) {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `外部伺服器回應 HTTP ${result.status}` }))
        return
      }
      if (result.body.length < 4 || result.body.slice(0, 4).toString('ascii') !== '%PDF') {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'URL 未指向有效 PDF（可能為登入牆或非公開論文）' }))
        return
      }
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': result.body.length,
        'Content-Disposition': 'attachment',
      })
      res.end(result.body)
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
    }
    return
  }

  /* ── TTS API（proxy 到 Python TTS server）── */

  if (req.url === '/api/tts/status' && req.method === 'GET') {
    try {
      const result = await pyRequest('/health')
      const data = JSON.parse(result.body.toString())
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ready: data.ready, initializing: data.loading, error: data.error }))
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ready: false, initializing: false, error: 'Python TTS API 無法連線' }))
    }
    return
  }

  if (req.url === '/api/tts/speakers' && req.method === 'GET') {
    try {
      const result = await pyRequest('/speakers')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(result.body)
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([]))
    }
    return
  }

  if (req.url === '/api/tts' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', async () => {
      try {
        const { text, speakerId } = JSON.parse(body)
        if (!text?.trim()) throw new Error('缺少 text 欄位')
        const pyBody = JSON.stringify({ text, speaker_id: speakerId ?? 0, speed: 1.0, format: 'wav' })
        const result = await pyRequest('/tts', 'POST', pyBody, TIMEOUT_SYNTH)
        if (result.status !== 200) {
          const err = JSON.parse(result.body.toString())
          throw new Error(err.detail || `HTTP ${result.status}`)
        }
        res.writeHead(200, {
          'Content-Type': 'audio/wav',
          'Content-Length': result.body.length,
          'Cache-Control': 'no-store',
        })
        res.end(result.body)
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e?.message ?? String(e) }))
      }
    })
    return
  }

  /* ── Static files + SPA fallback ── */

  const urlPath = req.url.split('?')[0]
  let filePath = join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath)
  if (!existsSync(filePath)) filePath = join(DIST_DIR, 'index.html')
  try {
    const content = readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not Found')
  }

}).listen(PORT, () => console.log(`Server running on port ${PORT}`))
