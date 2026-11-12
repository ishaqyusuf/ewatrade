// Live product-analytics permission, owned by AnalyticsRuntime. Kept apart from
// the runtime so request headers can read it without an import cycle.
let check: (() => boolean) | null = null

export function setAnalyticsCollectionCheck(next: (() => boolean) | null) {
  check = next
}
export function clearAnalyticsCollectionCheck(owner: () => boolean) {
  if (check === owner) check = null
}

/**
 * Analytics-only request signals: which app sent the request and whether this
 * app may currently collect. The API never uses them for authorization.
 */
export function analyticsRequestHeaders() {
  let allowed = false
  try {
    allowed = check?.() === true
  } catch {
    allowed = false
  }
  return {
    "x-ewatrade-client": "mobile",
    "x-ewatrade-analytics": allowed ? "allowed" : "denied",
  }
}
