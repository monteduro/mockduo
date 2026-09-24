import { useEffect, useRef, useState } from 'react'

type Props = {
  url: string
  open: boolean
  angleOverride?: number | null
  viewInsets: { top: number; bottom: number }
  onLoaded?: (url: string) => void
}

const INNER = { w: 951, h: 588 }
const OUTER = { w: 382, h: 678 }

async function cachedShot(url: string, width: number, height: number): Promise<string> {
  const siteUrl = new URL(url).href
  for (const version of ['screenshotone-v1', 'site-v5']) {
    const input = new TextEncoder().encode(JSON.stringify([version, siteUrl, width, height]))
    const digest = await crypto.subtle.digest('SHA-256', input)
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const path = `/shot-cache/${hash}.png`
    if ((await fetch(path, { method: 'HEAD' })).ok) return path
  }
  return `/shot.png?url=${encodeURIComponent(url)}&w=${width}&h=${height}`
}

export default function Duo3D({ url, open, angleOverride = null, viewInsets, onLoaded }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const firstFold = useRef(true)
  const requestId = useRef(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [shotError, setShotError] = useState(false)
  const [textures, setTextures] = useState<string[]>([])

  const post = (message: Record<string, unknown>) =>
    frame.current?.contentWindow?.postMessage(message, window.location.origin)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return
      const data = event.data || {}
      if (data.type === 'duo3d-ready') setReady(true)
      else if (data.type === 'duo3d-error') setError(data.message || 'Unknown error')
      else if (data.type === 'texture-ready' && data.requestId === requestId.current)
        setTextures((previous) => previous.includes(data.kind) ? previous : [...previous, data.kind])
      else if (data.type === 'texture-error' && data.requestId === requestId.current) {
        setShotError(true)
        setLoading(false)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    // An empty url means the site is still being chosen; keep the loading state.
    if (!ready || !url) return
    const currentRequest = ++requestId.current
    setTextures([])
    setShotError(false)
    setLoading(true)
    Promise.all([
      cachedShot(url, INNER.w, INNER.h),
      cachedShot(url, OUTER.w, OUTER.h),
    ]).then(([inner, outer]) => {
      if (currentRequest === requestId.current) {
        post({ type: 'screens', requestId: currentRequest, siteUrl: url, inner, outer })
      }
    }).catch(() => {
      if (currentRequest === requestId.current) {
        setShotError(true)
        setLoading(false)
      }
    })
  }, [ready, url])

  useEffect(() => {
    if (loading && textures.length === 2) {
      setLoading(false)
      onLoaded?.(url)
    }
  }, [loading, textures])

  useEffect(() => {
    if (!ready) return
    const target = angleOverride == null ? (open ? 180 : 0) : angleOverride
    post({ type: 'fold', value: target, animate: !firstFold.current })
    firstFold.current = false
  }, [ready, open, angleOverride])

  useEffect(() => {
    if (ready) post({ type: 'layout', top: viewInsets.top, bottom: viewInsets.bottom })
  }, [ready, viewInsets.top, viewInsets.bottom])

  return (
    <div className="stage duo3d">
      <div className="duo3d-frame-wrap">
        <iframe
          ref={frame}
          className="duo3d-frame"
          draggable={false}
          src="/duo3d/index.html?v=17"
          title="3D iPhone Duo preview"
          onLoad={() => {
            requestId.current++
            setReady(false)
            setError(null)
            setShotError(false)
            firstFold.current = true
            frame.current?.contentWindow?.postMessage({ type: 'status' }, window.location.origin)
          }}
        />
        {(!ready || loading || !url) && !error && !shotError && (
          <div className="duo3d-overlay" role="status">
            <span className="spinner" />
            <span>{ready ? 'Preparing both displays…' : 'Loading the Duo…'}</span>
          </div>
        )}
        {shotError && <div className="duo3d-overlay duo3d-overlay--error" role="alert">Could not capture this site. Check the URL and try again.</div>}
        {error && <div className="duo3d-overlay duo3d-overlay--error" role="alert">3D model unavailable: {error}</div>}
      </div>

    </div>
  )
}
