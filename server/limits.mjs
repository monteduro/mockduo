export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function rateLimiter(limit, intervalMs = 60000, maxClients = 10000) {
  const clients = new Map()
  let lastSweep = 0
  return (key, now = Date.now()) => {
    if (now - lastSweep >= intervalMs) {
      for (const [client, times] of clients) {
        while (times.length && times[0] <= now - intervalMs) times.shift()
        if (!times.length) clients.delete(client)
      }
      lastSweep = now
    }
    if (!clients.has(key) && clients.size >= maxClients) return false
    const times = clients.get(key) || []
    while (times.length && times[0] <= now - intervalMs) times.shift()
    if (times.length >= limit) return false
    times.push(now)
    clients.set(key, times)
    return true
  }
}

export function workQueue(maxWaiting) {
  const waiting = []
  let running = false
  function next() {
    const job = waiting.shift()
    if (!job) {
      running = false
      return
    }
    running = true
    Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(next)
  }
  return (fn) => {
    if (running && waiting.length >= maxWaiting) throw new HttpError(503, 'capture queue full')
    return new Promise((resolve, reject) => {
      waiting.push({ fn, resolve, reject })
      if (!running) next()
    })
  }
}
