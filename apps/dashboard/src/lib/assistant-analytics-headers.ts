/**
 * Analytics-only request signals for assistant calls: which app sent them and
 * the live collection decision. The API never uses them for authorization.
 */
export function assistantAnalyticsHeaders(events: { canCollect(): boolean }) {
  return {
    "x-ewatrade-client": "web",
    "x-ewatrade-analytics": events.canCollect() ? "allowed" : "denied",
  }
}
