import http, { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 3000
const DATA_FILE = join(__dirname, 'data', 'links.json')
const DEFAULT_FILE = join(__dirname, 'public', 'links.json')
const DIST_DIR = join(__dirname, 'dist')
const PYTHON_TTS_URL = process.env.PYTHON_TTS_URL || 'http://localhost:14000'

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
}

/* ── Links helpers ── */

function readLinks() {
  if (existsSync(DATA_FILE)) return JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  if (existsSync(DEFAULT_FILE)) return JSON.parse(readFileSync(DEFAULT_FILE, 'utf-8'))
  return []
}

function writeLinks(data) {
  mkdirSync(dirname(DATA_FILE), { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
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
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(readLinks()))
    return
  }

  if (req.url === '/api/links' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      writeLinks(JSON.parse(body))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
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
