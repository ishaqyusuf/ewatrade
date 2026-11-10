const APP_SCHEMES = new Set([
  "ewatrade:",
  "ewatrade-preview:",
  "ewatrade-dev:",
  "ewatrade-play-preview:",
])
const RECORD_ID = /^[A-Za-z0-9_-]{1,128}$/

function dashboardBase(dashboardUrl?: string) {
  if (!dashboardUrl) return null
  try {
    const url = new URL(dashboardUrl)
    return { host: url.host, base: url.pathname.replace(/\/$/, "") }
  } catch {
    return null
  }
}

/**
 * Saved-Product links (`/open/catalog-item/<id>`) from WhatsApp and the
 * assistant open that exact Catalog item. The link carries no scope: the item
 * screen reads it with the signed-in business, Store and role, as usual.
 */
export function resolveSavedRecordLink(path: string, dashboardUrl?: string) {
  let pathname: string
  try {
    const url = new URL(path)
    if (APP_SCHEMES.has(url.protocol)) {
      if (url.hostname !== "open") return null
      pathname = `/open${url.pathname}`
    } else if (url.protocol === "https:") {
      const dashboard = dashboardBase(dashboardUrl)
      if (!dashboard || url.host !== dashboard.host) return null
      if (!url.pathname.startsWith(`${dashboard.base}/open/`)) return null
      pathname = url.pathname.slice(dashboard.base.length)
    } else return null
  } catch {
    if (!path.startsWith("/")) return null
    pathname = path.split(/[?#]/)[0] ?? ""
  }
  const match = pathname.match(/^\/open\/catalog-item\/([^/]+)\/?$/)
  if (!match?.[1]) return null
  let id: string
  try {
    id = decodeURIComponent(match[1])
  } catch {
    return null
  }
  return RECORD_ID.test(id) ? `/catalog-item/${id}` : null
}
