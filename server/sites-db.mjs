import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openSitesDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sites (
      url TEXT PRIMARY KEY,
      host TEXT NOT NULL,
      submits INTEGER NOT NULL DEFAULT 1,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sites_first_seen ON sites (first_seen DESC);
    CREATE INDEX IF NOT EXISTS sites_submits ON sites (submits DESC);
  `)
  const upsert = db.prepare(`
    INSERT INTO sites (url, host, submits, first_seen, last_seen) VALUES (?, ?, 1, ?, ?)
    ON CONFLICT (url) DO UPDATE SET submits = submits + 1, last_seen = excluded.last_seen
  `)
  // Imports are idempotent: rerunning one keeps the larger count and the widest time range.
  const merge = db.prepare(`
    INSERT INTO sites (url, host, submits, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (url) DO UPDATE SET
      submits = MAX(submits, excluded.submits),
      first_seen = MIN(first_seen, excluded.first_seen),
      last_seen = MAX(last_seen, excluded.last_seen)
  `)
  const total = db.prepare('SELECT COUNT(*) AS total FROM sites')
  const columns = 'SELECT url, host, submits, first_seen, last_seen FROM sites'
  const lists = {
    recent: db.prepare(`${columns} ORDER BY first_seen DESC LIMIT ?`),
    popular: db.prepare(`${columns} ORDER BY submits DESC, last_seen DESC LIMIT ?`),
    latest: db.prepare(`${columns} ORDER BY last_seen DESC LIMIT ?`),
  }
  return {
    record(url, now = Date.now()) {
      upsert.run(url.href, url.hostname.replace(/^www\./, ''), now, now)
    },
    merge(url, submits, firstSeen, lastSeen) {
      merge.run(url.href, url.hostname.replace(/^www\./, ''), submits, firstSeen, lastSeen)
    },
    count() {
      return total.get().total
    },
    list(sort = 'recent', limit = 200) {
      return (lists[sort] || lists.recent).all(limit)
    },
    close() {
      db.close()
    },
  }
}
