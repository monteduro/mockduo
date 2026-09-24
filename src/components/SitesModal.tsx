import { useEffect, useRef, useState } from 'react'
import { faviconUrl, isPlaceholderFavicon, withRef } from '../siteLinks'

type Site = {
  url: string
  host: string
  submits: number
  first_seen: number
  last_seen: number
}

type Props = {
  open: boolean
  current: string
  onClose: () => void
  onSelect: (url: string) => void
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function ago(time: number): string {
  const seconds = (time - Date.now()) / 1000
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

function SiteIcon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="sites-list__avatar" aria-hidden="true">{host.charAt(0).toUpperCase()}</span>
  return (
    <span className="sites-list__avatar sites-list__avatar--icon" aria-hidden="true">
      <img
        src={faviconUrl(host)}
        width="22"
        height="22"
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        onLoad={(event) => {
          if (isPlaceholderFavicon(event.currentTarget)) setFailed(true)
        }}
      />
    </span>
  )
}

function sameSite(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href
  } catch {
    return false
  }
}

export default function SitesModal({ open, current, onClose, onSelect }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [sort, setSort] = useState<'recent' | 'popular'>('recent')
  const [query, setQuery] = useState('')
  const [sites, setSites] = useState<Site[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    else if (!open && element.open) element.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setFailed(false)
    fetch(`/api/sites?sort=${sort}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((body: { sites: Site[] }) => setSites(body.sites))
      .catch((error) => {
        if (error.name !== 'AbortError') setFailed(true)
      })
    return () => controller.abort()
  }, [open, sort])

  const filter = query.trim().toLowerCase()
  const visible = (sites || []).filter((site) => !filter || site.url.toLowerCase().includes(filter))

  return (
    <dialog
      ref={dialog}
      className="sites-modal"
      aria-labelledby="sites-modal-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sites-modal__panel">
        <div className="sites-modal__head">
          <h2 id="sites-modal-title">Previewed sites</h2>
          <button type="button" className="sites-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="sites-modal__tools">
          <input
            className="sites-modal__search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter sites"
            aria-label="Filter sites"
            spellCheck={false}
          />
          <div className="segmented segmented--small" role="group" aria-label="Sort">
            <button type="button" aria-pressed={sort === 'recent'} className={sort === 'recent' ? 'is-active' : ''} onClick={() => setSort('recent')}>Recent</button>
            <button type="button" aria-pressed={sort === 'popular'} className={sort === 'popular' ? 'is-active' : ''} onClick={() => setSort('popular')}>Popular</button>
          </div>
        </div>
        <div className="sites-modal__body">
          {failed ? <p className="sites-modal__empty">Could not load the list.</p>
            : sites === null ? <p className="sites-modal__empty">Loading…</p>
            : visible.length === 0 ? <p className="sites-modal__empty">{filter ? 'No matching sites.' : 'No sites yet.'}</p>
            : (
              <ul className="sites-list">
                {visible.map((site) => {
                  const path = site.url.replace(/^https?:\/\/(www\.)?[^/]+/, '').replace(/^\/$/, '')
                  return (
                    <li key={site.url} className={sameSite(site.url, current) ? 'is-current' : ''}>
                      <SiteIcon host={site.host} />
                      <div className="sites-list__text">
                        <strong title={site.url}>{site.host}<span>{path}</span></strong>
                        <small>{site.submits} {site.submits === 1 ? 'preview' : 'previews'} · added {ago(site.first_seen)}</small>
                      </div>
                      <div className="sites-list__actions">
                        <button type="button" className="chip chip--dark" onClick={() => onSelect(site.url)}>Preview</button>
                        <a className="chip" href={withRef(site.url)} target="_blank" rel="ugc nofollow noopener">Visit ↗</a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
        </div>
      </div>
    </dialog>
  )
}
