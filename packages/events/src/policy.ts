import type { AnalyticsBatch } from "@ishaqyusuf/logly-core"

const routeNames = new Set([
  "",
  "sign-in",
  "login",
  "sign-up",
  "register",
  "overview",
  "dashboard",
  "members",
  "contributions",
  "financing",
  "loans",
  "repayments",
  "settings",
  "reports",
  "notifications",
  "support",
  "pricing",
  "about",
  "contact",
  "features",
  "catalog",
  "orders",
  "inventory",
  "customers",
  "staff",
  "analytics",
  "pos",
  "cart",
  "checkout",
  "stores",
  "chat",
  "r",
  "setup",
])
export function safeRoute(route?: string) {
  const first = route?.split(/[?#]/)[0]?.split("/").filter(Boolean)[0] ?? ""
  return routeNames.has(first) ? `/${first}` : "/other"
}

export function safeBatch(
  batch: AnalyticsBatch,
  project: string,
): AnalyticsBatch {
  return {
    sentAt: batch.sentAt,
    sdk: batch.sdk,
    events: batch.events
      .filter(
        (event) => event.name === "site_visit" || event.name === "page_view",
      )
      .map((event) => ({
        eventId: event.eventId,
        project,
        name: event.name,
        version: 1,
        source: "browser",
        occurredAt: event.occurredAt,
        visitorId: event.visitorId,
        visitKind: event.visitKind,
        route: safeRoute(event.route),
        properties: {},
      })),
  }
}

export function isProductOrigin(
  origin: string,
  rootDomain: string,
  development = false,
) {
  try {
    const url = new URL(origin)
    const hostname = url.hostname
    if (url.origin !== origin) return false
    if (
      url.protocol === "https:" &&
      (hostname === rootDomain || hostname.endsWith(`.${rootDomain}`))
    )
      return true
    return (
      development &&
      ["http:", "https:"].includes(url.protocol) &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.endsWith(".localhost"))
    )
  } catch {
    return false
  }
}
