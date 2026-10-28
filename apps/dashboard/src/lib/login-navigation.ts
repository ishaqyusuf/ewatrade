import { isManualPaymentShortCode } from "@ewatrade/utils/manual-payments"

export function getLoginDestination(next?: string | null) {
  if (!next?.startsWith("/") || next.startsWith("//")) return "/"
  const base = "https://dashboard.example"
  let url: URL
  try {
    url = new URL(next, base)
  } catch {
    return "/"
  }
  if (
    url.origin !== base ||
    url.pathname === "/login" ||
    url.pathname.startsWith("/api/")
  )
    return "/"
  return `${url.pathname}${url.search}${url.hash}`
}

/** Payment login reuses account identity without granting workspace membership. */
export function isPaymentLoginDestination(next?: string | null) {
  if (!next || getLoginDestination(next) !== next) return false
  const url = new URL(next, "https://dashboard.example")
  if (url.search || url.hash) return false
  const shortCode = /^\/p\/([^/]+)$/.exec(url.pathname)?.[1]
  return shortCode !== undefined
    ? isManualPaymentShortCode(shortCode)
    : /^\/pay\/[A-Za-z0-9_.-]{1,4096}$/.test(url.pathname)
}
