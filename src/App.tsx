import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Duo3D from './components/Duo3D'
import SitesModal from './components/SitesModal'
import { faviconUrl, isPlaceholderFavicon, withRef } from './siteLinks'

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

// /example.com/page opens https://example.com/page; ?site= is still accepted.
// An empty result means the home page, which shows the most recently submitted site.
function siteFromLocation(): string {
  const path = decodeURIComponent(window.location.pathname.slice(1))
  const fromPath = path.includes('.') ? normalize(path) : ''
  return fromPath || normalize(new URLSearchParams(window.location.search).get('site') || '')
}

async function homepageSite(): Promise<string> {
  try {
    const response = await fetch('/api/sites?sort=latest&limit=1')
    const body: { sites?: { url: string }[] } = response.ok ? await response.json() : {}
    return normalize(body.sites?.[0]?.url || '')
  } catch {
    return ''
  }
}

function sitePath(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.search || parsed.hash || parsed.username) {
    return `/?site=${encodeURIComponent(url)}`
  }
  return `/${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`
}

function logSubmit(url: string): Promise<unknown> {
  return fetch('/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
    keepalive: true,
  }).catch(() => {})
}

// Morphs the header between the showcase and the claim form where the browser
// supports view transitions; elsewhere, and with reduced motion, it switches instantly.
function morph(update: () => void) {
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}

function CurrentSite({ url }: { url: string }) {
  const [iconHidden, setIconHidden] = useState(false)
  if (!url) return <span className="url-display__text url-display__text--muted">Loading…</span>
  const parsed = new URL(url)
  const host = parsed.hostname.replace(/^www\./, '')
  const path = parsed.pathname === '/' ? '' : parsed.pathname
  return (
    <>
      {!iconHidden && (
        <img
          className="url-display__icon"
          src={faviconUrl(host)}
          width="18"
          height="18"
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setIconHidden(true)}
          onLoad={(event) => {
            if (isPlaceholderFavicon(event.currentTarget)) setIconHidden(true)
          }}
        />
      )}
      <span className="url-display__text" title={url}>{host}<span>{path}</span></span>
    </>
  )
}

function CrownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 5.2 5.3 8 8 3l2.7 5L14 5.2 12.8 12H3.2L2 5.2Z" fill="currentColor" />
      <rect x="3.2" y="12.8" width="9.6" height="1.6" rx=".8" fill="currentColor" />
    </svg>
  )
}

function GalleryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
    </svg>
  )
}

const INITIAL_URL = siteFromLocation()

export default function App() {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [claimError, setClaimError] = useState('')
  const homepage = useRef('')
  const [url, setUrl] = useState(INITIAL_URL)
  const navigation = useRef(0)
  const [open, setOpen] = useState(params.get('open') === '1')
  const [viewInsets, setViewInsets] = useState({ top: 0, bottom: 0 })
  const [sitesOpen, setSitesOpen] = useState(false)
  const [siteCount, setSiteCount] = useState<number | null>(null)
  // Only sites entered through the form are logged, once both displays have loaded.
  const pendingLog = useRef<string | null>(null)
  const loadedUrl = useRef<string | null>(null)
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

  function display(next: string) {
    navigation.current++
    setUrl(next)
  }

  function startEditing() {
    morph(() => {
      setDraft('')
      setClaimError('')
      setEditing(true)
    })
    homepageSite().then((site) => {
      homepage.current = site
    })
  }

  function showLatest() {
    const current = ++navigation.current
    homepageSite().then((next) => {
      homepage.current = next
      if (current === navigation.current) display(next || DEFAULT_URL)
    })
  }

  useEffect(() => {
    if (!INITIAL_URL) showLatest()
    const onPopState = () => {
      const next = siteFromLocation()
      if (next) display(next)
      else showLatest()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function refreshCount() {
    fetch('/api/sites?limit=0')
      .then((response) => response.ok ? response.json() : null)
      .then((body: { total?: number } | null) => {
        if (typeof body?.total === 'number') setSiteCount(body.total)
      })
      .catch(() => {})
  }

  useEffect(refreshCount, [])

  function show(next: string) {
    const path = sitePath(next)
    if (path !== window.location.pathname + window.location.search) window.history.pushState(null, '', path)
    display(next)
  }

  function goHome() {
    if (window.location.pathname + window.location.search !== '/') window.history.pushState(null, '', '/')
    showLatest()
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = normalize(draft)
    if (!next) return
    if (next === homepage.current) {
      setClaimError("That's already the homepage")
      return
    }
    if (next === loadedUrl.current) claim(next)
    else pendingLog.current = next
    morph(() => {
      setEditing(false)
      show(next)
    })
  }

  function claim(site: string) {
    homepage.current = site
    logSubmit(site).then(refreshCount)
  }

  function cancelEditing() {
    morph(() => setEditing(false))
  }

  function onLoaded(loaded: string) {
    loadedUrl.current = loaded
    if (pendingLog.current === loaded) {
      pendingLog.current = null
      claim(loaded)
    }
  }

  return (
    <div className="app" ref={appRef}>
      <header className="app-header" ref={headerRef}>
        <div className="brand">
          <h1>
            <a
              href="/"
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
                event.preventDefault()
                goHome()
              }}
            >
              MockDuo
            </a>
          </h1>
          <p>Preview any website on iPhone Duo.</p>
        </div>

        {editing ? (
          <form className="url-form" onSubmit={submit}>
            <input
              className="url-input"
              type="text"
              inputMode="url"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setClaimError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancelEditing()
              }}
              placeholder="yourwebsite.com"
              aria-label="Website URL"
              spellCheck={false}
              autoComplete="url"
              autoFocus
            />
            <button type="button" className="url-form__cancel" onClick={cancelEditing} aria-label="Cancel">×</button>
            <button className="btn btn--primary" type="submit" data-fast-goal="preview_clicked">Preview</button>
            {claimError && <p className="url-form__error" role="alert">{claimError}</p>}
          </form>
        ) : (
          <div className="url-form url-display">
            <CurrentSite key={url} url={url} />
            {url && (
              <a className="btn btn--light" href={withRef(url)} target="_blank" rel="ugc nofollow noopener">
                Visit ↗
              </a>
            )}
          </div>
        )}
        {!editing && (
          <button type="button" className="gallery-button cta-button" onClick={startEditing} data-fast-goal="claim_homepage_clicked">
            <CrownIcon />
            Claim it
          </button>
        )}
        <button type="button" className="gallery-button" onClick={() => setSitesOpen(true)}>
          <GalleryIcon />
          Gallery
          {siteCount !== null && <strong className="gallery-button__count">{siteCount}</strong>}
        </button>
        <div className="byline">
          <span className="byline__label">Made by</span> <a href="https://x.com/stemonteduro" target="_blank" rel="noopener noreferrer">@stemonte</a>
          <a className="github-link" href="https://github.com/monteduro/mockduo" target="_blank" rel="noopener noreferrer" aria-label="MockDuo on GitHub" title="MockDuo on GitHub">
            <img src="/github.svg" width="22" height="22" alt="" />
          </a>
        </div>
      </header>

      <main className="app-main">
        <Duo3D url={url} open={open} angleOverride={ANGLE_OVERRIDE} viewInsets={viewInsets} onLoaded={onLoaded} />
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

      <SitesModal
        open={sitesOpen}
        current={url}
        onClose={() => setSitesOpen(false)}
        onSelect={(next) => {
          setSitesOpen(false)
          show(normalize(next))
        }}
      />
    </div>
  )
}
