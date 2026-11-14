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
 * assistant open that exact Catalog item; receipt approval links
 * (`/open/receipt-approval/<id>`) open the approval screen. The link carries
 * no scope: each screen reads it with the signed-in business, Store and role.
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
  const match = pathname.match(
    /^\/open\/(catalog-item|receipt-approval)\/([^/]+)\/?$/,
  )
  if (!match?.[1] || !match[2]) return null
  let id: string
  try {
    id = decodeURIComponent(match[2])
  } catch {
    return null
  }
  return RECORD_ID.test(id) ? `/${match[1]}/${id}` : null
}
