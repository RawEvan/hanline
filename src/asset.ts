/** Join a site-relative path to Vite's configured base (e.g. `/hanline/`). */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL || '/'): string {
  const root = base || '/'
  const clean = String(path || '').replace(/^\/+/, '')
  if (!clean) return root
  return `${root}${clean}`
}
