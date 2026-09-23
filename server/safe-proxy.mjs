import dns from 'node:dns/promises'
import net from 'node:net'

const blocked = new net.BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(network, prefix)
for (const [network, prefix] of [
  ['::', 128], ['::1', 128],
  ['64:ff9b::', 96], ['64:ff9b:1::', 48],
  ['100::', 64], ['2001::', 32], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blocked.addSubnet(network, prefix, 'ipv6')

export function publicUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('invalid site url')
  const supplied = input.trim()
  const candidate = supplied.startsWith('//')
    ? `https:${supplied}`
    : /^[a-z][a-z\d+.-]*:/i.test(supplied) ? supplied : `https://${supplied}`
  let url
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('invalid site url')
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('invalid site url')
  }
  return url
}

export function isPublicAddress(address) {
  const family = net.isIP(address)
  return family !== 0 && !blocked.check(address, family === 6 ? 'ipv6' : 'ipv4')
}

export async function resolvePublicAddress(hostname, lookup = dns.lookup) {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('private destination')
  }
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await lookup(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('private destination')
  }
  return addresses.find(({ family }) => family === 4) || addresses[0]
}
