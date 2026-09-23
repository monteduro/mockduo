import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPublicAddress, publicUrl, resolvePublicAddress } from './safe-proxy.mjs'

test('accepts public URLs and rejects credentials and non-web schemes', () => {
  assert.equal(publicUrl('example.com/path').href, 'https://example.com/path')
  for (const url of ['file:///etc/passwd', 'http://user:pass@example.com/', 'javascript:alert(1)']) {
    assert.throws(() => publicUrl(url))
  }
})

test('blocks local, private, mapped and metadata addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '::1', '::ffff:7f00:1', 'fc00::1']) {
    assert.equal(isPublicAddress(address), false, address)
  }
  for (const address of ['8.8.8.8', '2606:4700:4700::1111']) {
    assert.equal(isPublicAddress(address), true, address)
  }
  for (const host of ['127.1', '2130706433', '0x7f000001', '[::ffff:127.0.0.1]']) {
    assert.equal(isPublicAddress(publicUrl(`http://${host}/`).hostname.replace(/^\[|\]$/g, '')), false, host)
  }
})

test('rejects a hostname when any DNS answer is private', async () => {
  await assert.rejects(resolvePublicAddress('localhost'))
  await assert.rejects(resolvePublicAddress('example.com', async () => [
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]))
  assert.deepEqual(await resolvePublicAddress('example.com', async () => [
    { address: '2606:4700:4700::1111', family: 6 },
    { address: '8.8.8.8', family: 4 },
  ]), { address: '8.8.8.8', family: 4 })
})
