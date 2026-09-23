import { useLayoutEffect, useRef, useState } from 'react'
import Duo3D from './components/Duo3D'

const DEFAULT_URL = 'https://www.apple.com/iphone-duo/'
const params = new URLSearchParams(window.location.search)
const angle = params.get('angle')
const ANGLE_OVERRIDE = angle !== null && angle.trim() !== '' && Number.isFinite(Number(angle))
  ? Math.max(0, Math.min(180, Number(angle)))
  : null

function normalize(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  try {
    const value = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    // A bare domain and the same domain with https:// share one URL and cache key.
    return parsed.pathname === '/' && !parsed.search && !parsed.hash
      ? parsed.href.slice(0, -1)
      : parsed.href
  } catch {
    return ''
  }
}

const INITIAL_URL = normalize(params.get('site') || '') || DEFAULT_URL

export default function App() {
  const [draft, setDraft] = useState(INITIAL_URL)
  const [url, setUrl] = useState(INITIAL_URL)
  const [open, setOpen] = useState(params.get('open') === '1')
  const [viewInsets, setViewInsets] = useState({ top: 0, bottom: 0 })
  const appRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const app = appRef.current
    const header = headerRef.current
    const bottom = bottomRef.current
    if (!app || !header || !bottom) return

    const measure = () => {
      const scene = app.getBoundingClientRect()
      const top = Math.ceil(header.getBoundingClientRect().bottom - scene.top + 16)
      const bottomInset = Math.ceil(scene.bottom - bottom.getBoundingClientRect().top + 16)
      setViewInsets((previous) => previous.top === top && previous.bottom === bottomInset
        ? previous : { top, bottom: bottomInset })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(app)
    observer.observe(header)
    observer.observe(bottom)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = normalize(draft)
    if (next) {
      setUrl(next)
    }
  }

  return (
    <div className="app" ref={appRef}>
      <header className="app-header" ref={headerRef}>
        <div className="brand">
          <h1>MockDuo</h1>
          <p>Preview any website on iPhone Duo.</p>
        </div>

        <form className="url-form" onSubmit={submit}>
          <input
            className="url-input"
            type="text"
            inputMode="url"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="yourwebsite.com"
            aria-label="Website URL"
            spellCheck={false}
            autoComplete="url"
          />
          <button className="btn btn--primary" type="submit" data-fast-goal="preview_clicked">Preview</button>
        </form>
        <div className="byline">
          Made by <a href="https://x.com/stemonteduro" target="_blank" rel="noopener noreferrer">@stemonte</a>
          <a className="github-link" href="https://github.com/monteduro/mockduo" target="_blank" rel="noopener noreferrer" aria-label="MockDuo on GitHub" title="MockDuo on GitHub">
            <img src="/github.svg" width="22" height="22" alt="" />
          </a>
        </div>
      </header>

      <main className="app-main">
        <Duo3D url={url} open={open} angleOverride={ANGLE_OVERRIDE} viewInsets={viewInsets} />
      </main>

      <div className="app-bottom" ref={bottomRef}>
        <footer className="site-footer">
          <div className="footer-resources" aria-label="Resources used">
            <span className="footer-label">Credits</span>
            <a href="https://github.com/chuspeeism/iphone-duo" target="_blank" rel="noopener noreferrer">Original 3D project</a>
          </div>
          <div className={`segmented${open ? ' segmented--open' : ''}`} role="group" aria-label="Position">
            <button type="button" aria-pressed={open} className={open ? 'is-active' : ''} onClick={() => setOpen(true)}>Open</button>
            <button type="button" aria-pressed={!open} className={!open ? 'is-active' : ''} onClick={() => setOpen(false)}>Closed</button>
          </div>
          <a className="screenshotone-credit" href="https://screenshotone.com/?via=mockduo" target="_blank" rel="noopener noreferrer" aria-label="Screenshots by ScreenshotOne">
            <span>Screenshots by</span>
            <img src="/screenshotone.svg" width="20" height="20" alt="" />
            <strong>ScreenshotOne</strong>
          </a>
        </footer>
      </div>
    </div>
  )
}
