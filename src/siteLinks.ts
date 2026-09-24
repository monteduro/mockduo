// Tags outbound visits so site owners can attribute the traffic to MockDuo.
export function withRef(url: string): string {
  const parsed = new URL(url)
  if (!parsed.searchParams.has('ref')) parsed.searchParams.set('ref', 'mockduo')
  return parsed.href
}

export function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
}

// Unknown domains get Google's 16px globe instead of an error.
export function isPlaceholderFavicon(image: HTMLImageElement): boolean {
  return image.naturalWidth <= 16
}
