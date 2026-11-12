/**
 * Analytics-only request signal: which app sent the request. The API never
 * uses it for authorization. Assistant usage analytics rely on EwaTrade's
 * terms plus server-side QA/age gates; add `x-ewatrade-analytics: denied` here
 * if a per-user opt-out setting is introduced.
 */
export function analyticsRequestHeaders() {
  return { "x-ewatrade-client": "mobile" }
}
