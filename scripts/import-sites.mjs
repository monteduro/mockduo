// Imports sites into the gallery from a file or stdin. Accepts either one URL or
// domain per line, or a ScreenshotOne "request logs" CSV export, where every
// successful submit appears as two captures (inner and outer display).
// --map host=url records a host's captures under a specific page, since the CSV
// has no paths.
// Usage: node scripts/import-sites.mjs [--skip host,host] [--map host=url] [file]
import fs from 'node:fs'
import path from 'node:path'
import { publicUrl } from '../server/safe-proxy.mjs'
import { openSitesDb } from '../server/sites-db.mjs'

const args = process.argv.slice(2)
const skipIndex = args.indexOf('--skip')
const skip = new Set(skipIndex === -1 ? [] : args.splice(skipIndex, 2)[1].split(',').map((host) => host.trim().toLowerCase()))
const mapIndex = args.indexOf('--map')
const map = new Map(mapIndex === -1 ? [] : args.splice(mapIndex, 2)[1].split(',').map((pair) => pair.split('=').map((part) => part.trim())))
const input = fs.readFileSync(args[0] || 0, 'utf8')

function csvRow(line) {
  return [...line.matchAll(/"((?:[^"]|"")*)"|([^,]+)|(?<=,|^)(?=,|$)/g)].map((match) => (match[1] ?? match[2] ?? '').replace(/""/g, '"'))
}

const sites = new Map()
const lines = input.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'))
const header = csvRow(lines[0] || '')
const hostColumn = header.indexOf('Target Host')
const now = Date.now()

for (const line of hostColumn === -1 ? lines : lines.slice(1)) {
  let value = line.trim()
  let time = now
  let captures = 2
  if (hostColumn !== -1) {
    const row = csvRow(line)
    if (row[header.indexOf('Status')] !== 'Success') continue
    value = row[hostColumn]
    time = Date.parse(row[header.indexOf('Timestamp')]) || now
    captures = 1
  }
  let url
  try {
    url = publicUrl(value)
  } catch {
    console.warn(`skipped invalid: ${value}`)
    continue
  }
  // --skip matches the exact host, so apple.com and www.apple.com can be handled separately.
  if (skip.has(url.hostname.toLowerCase())) continue
  if (map.has(url.hostname.toLowerCase())) url = publicUrl(map.get(url.hostname.toLowerCase()))
  const site = sites.get(url.href) || { url, captures: 0, first: time, last: time }
  site.captures += captures
  site.first = Math.min(site.first, time)
  site.last = Math.max(site.last, time)
  sites.set(url.href, site)
}

const db = openSitesDb(process.env.SITES_DB_PATH || path.resolve('server/data/sites.db'))
for (const site of sites.values()) db.merge(site.url, Math.max(1, Math.ceil(site.captures / 2)), site.first, site.last)
db.close()
console.log(`imported ${sites.size} sites`)
