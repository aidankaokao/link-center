import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 3000
const DATA_FILE = join(__dirname, 'data', 'links.json')
const DEFAULT_FILE = join(__dirname, 'public', 'links.json')
const DIST_DIR = join(__dirname, 'dist')

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

function readLinks() {
  if (existsSync(DATA_FILE)) return JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  if (existsSync(DEFAULT_FILE)) return JSON.parse(readFileSync(DEFAULT_FILE, 'utf-8'))
  return []
}

function writeLinks(data) {
  mkdirSync(dirname(DATA_FILE), { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

createServer((req, res) => {
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

  // Static files + SPA fallback
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
