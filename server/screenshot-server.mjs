import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { publicUrl, resolvePublicAddress } from './safe-proxy.mjs'
import { HttpError, rateLimiter, workQueue } from './limits.mjs'

const PORT = Number(process.env.SHOT_PORT || 8787)
const MAX_IMAGE_BYTES = 32 * 1024 * 1024
const MAX_CACHE_BYTES = 512 * 1024 * 1024
const CACHE_DIR = process.env.SHOT_CACHE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'cache')
const SCREENSHOTONE_KEY = process.env.SCREENSHOTONE_ACCESS_KEY || process.env.SCREENSHOTONE_API_KEY
const SCREENSHOTONE_URL = process.env.SCREENSHOTONE_API_URL || 'https://api.screenshotone.com/take'
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')
const DAILYGRAM_FIGTREE = `
  @font-face{font-family:Figtree;font-style:normal;font-weight:400;
    src:url(https://fonts.gstatic.com/s/figtree/v9/_Xmz-HUzqDCFdgfMsYiV_F7wfS-Bs_d_QF5e.ttf)}
  @font-face{font-family:Figtree;font-style:normal;font-weight:700;
    src:url(https://fonts.gstatic.com/s/figtree/v9/_Xmz-HUzqDCFdgfMsYiV_F7wfS-Bs_eYR15e.ttf)}`

const queue = workQueue(10)
const requestsPerIp = rateLimiter(30)
const capturesPerIp = rateLimiter(10)
const capturesGlobal = rateLimiter(60)
const inFlight = new Map()
let lastCachePrune = 0

async function captureWithScreenshotOne(url, width, height) {
  if (!SCREENSHOTONE_KEY || SCREENSHOTONE_KEY === 'your_screenshotone_access_key') {
    throw new HttpError(503, 'ScreenshotOne is not configured')
  }
  const mobile = width < 600
  const options = new URLSearchParams({
    url,
    format: 'png',
    viewport_width: String(width),
    viewport_height: String(height),
    device_scale_factor: '3',
    viewport_mobile: String(mobile),
    viewport_has_touch: String(mobile),
    block_cookie_banners: 'true',
    block_ads: 'true',
    delay: '5',
    cache: 'true',
  })
  if (new URL(url).hostname.replace(/^www\./, '') === 'dailygram.me') {
    options.set('styles', DAILYGRAM_FIGTREE)
  }
  const response = await fetch(`${SCREENSHOTONE_URL}?${options}`, {
    headers: { 'X-Access-Key': SCREENSHOTONE_KEY },
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.error_message || body?.error?.message || body?.error_code || response.statusText
    throw new Error(`ScreenshotOne ${response.status}: ${detail}`)
  }
  if (!response.body) throw new Error('ScreenshotOne returned an empty response')
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel()
      throw new Error('ScreenshotOne image is too large')
    }
    chunks.push(value)
  }
  const png = Buffer.concat(chunks)
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('ScreenshotOne did not return a PNG image')
  }
  return png
}

async function readCachedPng(file) {
  try {
    const stat = await fs.promises.stat(file)
    if (stat.size > MAX_IMAGE_BYTES) return null
    const png = await fs.promises.readFile(file)
    return png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ? png : null
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function pruneCache() {
  if (Date.now() - lastCachePrune < 60000) return
  lastCachePrune = Date.now()
  const files = []
  for (const entry of await fs.promises.readdir(CACHE_DIR, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !entry.name.endsWith('.png')) continue
    const file = path.join(CACHE_DIR, entry.name)
    const stat = await fs.promises.stat(file).catch(() => null)
    if (stat) files.push({ file, size: stat.size, time: stat.mtimeMs })
  }
  let total = files.reduce((sum, file) => sum + file.size, 0)
  for (const file of files.sort((a, b) => a.time - b.time)) {
    if (total <= MAX_CACHE_BYTES) break
    await fs.promises.rm(file.file, { force: true }).catch(() => {})
    total -= file.size
  }
}

async function cachedCapture(key, file, legacyFile, clientIp, render) {
  const cached = await readCachedPng(file) || await readCachedPng(legacyFile)
  if (cached) return cached
  if (inFlight.has(key)) return inFlight.get(key)
  if (!capturesPerIp(clientIp) || !capturesGlobal('all')) throw new HttpError(429, 'capture rate exceeded')
  const pending = queue(async () => {
    const existing = await readCachedPng(file) || await readCachedPng(legacyFile)
    if (existing) return existing
    const png = await render()
    if (png.length > MAX_IMAGE_BYTES) throw new Error('captured image is too large')
    await fs.promises.mkdir(CACHE_DIR, { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    try {
      await fs.promises.writeFile(temporary, png)
      await fs.promises.rename(temporary, file)
    } finally {
      await fs.promises.rm(temporary, { force: true }).catch(() => {})
    }
    await pruneCache().catch((error) => console.warn('cache prune failed', error.message))
    return png
  })
  inFlight.set(key, pending)
  pending.finally(() => inFlight.delete(key)).catch(() => {})
  return pending
}

function dimension(value, fallback) {
  if (value == null) return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 1200) throw new HttpError(400, 'invalid image size')
  return number
}

function clientAddress(req) {
  const remote = req.socket.remoteAddress || 'unknown'
  const forwarded = req.headers['x-real-ip']
  if (process.env.SHOT_TRUST_PROXY === '1' &&
      (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') &&
      typeof forwarded === 'string' && net.isIP(forwarded)) return forwarded
  return remote
}

const server = http.createServer(async (req, res) => {
  let url
  try {
    url = new URL(req.url, `http://localhost:${PORT}`)
  } catch {
    res.writeHead(400)
    res.end('invalid request')
    return
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }
  if (url.pathname !== '/shot' && url.pathname !== '/shot.png') {
    res.writeHead(404)
    res.end('not found')
    return
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET' })
    res.end('method not allowed')
    return
  }
  const clientIp = clientAddress(req)
  if (!requestsPerIp(clientIp)) {
    res.writeHead(429, { 'retry-after': '60' })
    res.end('request rate exceeded')
    return
  }
  try {
    const target = url.searchParams.get('url')
    if (!target) throw new HttpError(400, 'missing url')
    const siteUrl = publicUrl(target)
    await resolvePublicAddress(siteUrl.hostname)
    const width = dimension(url.searchParams.get('w'), 1024)
    const height = dimension(url.searchParams.get('h'), 768)
    const key = createHash('sha256').update(JSON.stringify(['screenshotone-v1', siteUrl.href, width, height])).digest('hex')
    const file = path.join(CACHE_DIR, `${key}.png`)
    const legacyKey = createHash('sha256').update(JSON.stringify(['site-v5', siteUrl.href, width, height])).digest('hex')
    const legacyFile = path.join(CACHE_DIR, `${legacyKey}.png`)
    const png = await cachedCapture(key, file, legacyFile, clientIp, () => captureWithScreenshotOne(siteUrl.href, width, height))
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=86400' })
    res.end(png)
  } catch (error) {
    const status = error instanceof HttpError ? error.status
      : ['private destination', 'invalid site url'].includes(error.message) ? 400 : 502
    if (status === 502) console.error('ScreenshotOne request failed', error.name || 'Error')
    res.writeHead(status, {
      'content-type': 'application/json',
      ...(status === 429 || status === 503 ? { 'retry-after': '60' } : {}),
    })
    res.end(JSON.stringify({ error: status === 502 ? 'capture failed' : error.message }))
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`ScreenshotOne proxy on http://127.0.0.1:${PORT}`))
