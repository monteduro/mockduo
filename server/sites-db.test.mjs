import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openSitesDb } from './sites-db.mjs'

test('records sites and counts repeated submits', () => {
  const db = openSitesDb(':memory:')
  db.record(new URL('https://www.example.com/'), 1000)
  db.record(new URL('https://other.org/page'), 2000)
  db.record(new URL('https://www.example.com/'), 3000)
  assert.deepEqual(db.list('recent').map((site) => [site.host, site.submits]), [['other.org', 1], ['example.com', 2]])
  assert.equal(db.list('popular')[0].url, 'https://www.example.com/')
  assert.equal(db.list('recent', 1).length, 1)
  assert.equal(db.count(), 2)
  assert.equal(db.list('latest', 1)[0].url, 'https://www.example.com/')
  db.close()
})

test('merges imports without double counting', () => {
  const db = openSitesDb(':memory:')
  const url = new URL('https://example.com/')
  db.merge(url, 3, 2000, 5000)
  db.merge(url, 2, 1000, 4000)
  const [site] = db.list()
  assert.deepEqual([site.submits, site.first_seen, site.last_seen], [3, 1000, 5000])
  db.close()
})
