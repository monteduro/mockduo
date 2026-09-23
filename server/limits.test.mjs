import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HttpError, rateLimiter, workQueue } from './limits.mjs'

test('rate limiter counts each client and frees the window', () => {
  const allow = rateLimiter(2, 1000)
  assert.equal(allow('one', 1000), true)
  assert.equal(allow('one', 1001), true)
  assert.equal(allow('one', 1002), false)
  assert.equal(allow('two', 1002), true)
  assert.equal(allow('one', 2001), true)
})

test('rate limiter caps tracked client identities', () => {
  const allow = rateLimiter(2, 1000, 1)
  assert.equal(allow('one', 1000), true)
  assert.equal(allow('two', 1001), false)
  assert.equal(allow('two', 2001), true)
})

test('work queue rejects excess jobs and continues after a failure', async () => {
  const queue = workQueue(1)
  let release
  const first = queue(() => new Promise((resolve) => { release = resolve }))
  const second = queue(() => { throw new Error('expected failure') })
  assert.throws(() => queue(() => 'too many'), (error) => error instanceof HttpError && error.status === 503)
  await Promise.resolve()
  release('first')
  assert.equal(await first, 'first')
  await assert.rejects(second, /expected failure/)
  assert.equal(await queue(() => 'next'), 'next')
})
