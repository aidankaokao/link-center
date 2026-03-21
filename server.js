import http, { createServer } from 'http'
import https from 'https'
import { createWriteStream, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 3000
const DATA_FILE = join(__dirname, 'data', 'links.json')
const DEFAULT_FILE = join(__dirname, 'public', 'links.json')
const DIST_DIR = join(__dirname, 'dist')
const PIPER_BIN = join(__dirname, 'bin', 'piper', 'piper')
const MODELS_TTS_DIR = join(__dirname, 'models', 'tts')

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

/* ── TTS ── */

// 預設隨容器自動下載的模型
const DEFAULT_MODEL = {
  onnx: join(MODELS_TTS_DIR, 'zh_CN-huayan-medium.onnx'),
  json: join(MODELS_TTS_DIR, 'zh_CN-huayan-medium.onnx.json'),
  onnxUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx',
  jsonUrl: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx.json',
}

// 掃描 models/tts/ 目錄，找出所有 .onnx + .onnx.json 配對
function getAvailableModels() {
  if (!existsSync(MODELS_TTS_DIR)) return []
  return readdirSync(MODELS_TTS_DIR)
    .filter(f => f.endsWith('.onnx') && existsSync(join(MODELS_TTS_DIR, f + '.json')))
    .map((f, i) => ({
      id: i,
      name: f.replace('.onnx', ''),
      onnx: join(MODELS_TTS_DIR, f),
      json: join(MODELS_TTS_DIR, f + '.json'),
    }))
}

let modelDownloading = false
let modelError = null

function modelReady() {
  return existsSync(DEFAULT_MODEL.onnx) && existsSync(DEFAULT_MODEL.json)
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    function get(u) {
      const mod = u.startsWith('https') ? https : http
      mod.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          const loc = res.headers.location
          const next = loc.startsWith('http') ? loc : new URL(loc, u).href
          get(next)
          return
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
        const out = createWriteStream(dest)
        res.pipe(out)
        out.on('finish', resolve)
        out.on('error', reject)
      }).on('error', reject)
    }
    get(url)
  })
}

async function downloadModel() {
  if (modelReady() || modelDownloading || modelError) return
  modelDownloading = true
  modelError = null
  try {
    console.log('TTS models not found, downloading...')
    mkdirSync(MODELS_TTS_DIR, { recursive: true })
    console.log(`Downloading ${DEFAULT_MODEL.onnx.split('/').pop()}...`)
    await downloadFile(DEFAULT_MODEL.onnxUrl, DEFAULT_MODEL.onnx)
    await downloadFile(DEFAULT_MODEL.jsonUrl, DEFAULT_MODEL.json)
    console.log('TTS model downloaded.')
  } catch (e) {
    modelError = e?.message ?? String(e)
    console.error('TTS model download failed:', modelError)
    if (existsSync(DEFAULT_MODEL.onnx)) unlinkSync(DEFAULT_MODEL.onnx)
    if (existsSync(DEFAULT_MODEL.json)) unlinkSync(DEFAULT_MODEL.json)
  } finally {
    modelDownloading = false
  }
}

/* ── HTTP Server ── */

createServer((req, res) => {

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

  /* ── TTS API ── */

  if (req.url === '/api/tts/status' && req.method === 'GET') {
    downloadModel() // 觸發按需下載（non-await，背景執行）
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ready: modelReady(), initializing: modelDownloading, error: modelError }))
    return
  }

  if (req.url === '/api/tts/speakers' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getAvailableModels().map(m => ({ id: m.id, name: m.name }))))
    return
  }

  if (req.url === '/api/tts' && req.method === 'POST') {
    if (!modelReady()) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: modelDownloading ? '模型下載中，請稍候' : (modelError ?? '模型未就緒') }))
      return
    }
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const { text, speakerId } = JSON.parse(body)
        if (!text?.trim()) throw new Error('缺少 text 欄位')
        const models = getAvailableModels()
        const model = models[speakerId ?? 0] ?? models[0]
        const tmpWav = join(tmpdir(), `tts-${Date.now()}.wav`)
        const result = spawnSync(PIPER_BIN, ['--model', model.onnx, '--output_file', tmpWav], {
          input: text,
          encoding: 'utf-8',
          env: { ...process.env, LD_LIBRARY_PATH: dirname(PIPER_BIN) },
        })
        if (result.status !== 0) throw new Error(result.stderr?.toString() || 'piper 執行失敗')
        const wav = readFileSync(tmpWav)
        unlinkSync(tmpWav)
        res.writeHead(200, {
          'Content-Type': 'audio/wav',
          'Content-Length': wav.length,
          'Cache-Control': 'no-store',
        })
        res.end(wav)
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
