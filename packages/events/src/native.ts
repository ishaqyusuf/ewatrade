import type {
  AnalyticsBatch,
  AnalyticsConfig,
  AnalyticsEvent,
} from "@ishaqyusuf/logly-core"
import { safeRoute } from "./policy"

type Visitor = { id: string; firstSeenOn: string; lastVisitOn: string | null }
// Native deliberately uses no browser globals. IDs are installation-local and project-scoped.
export function createNativeAnalytics(options: {
  endpoint: string
  enabled: boolean
  storage: AnalyticsConfig["storage"]
  createId: () => string
  now?: () => Date
  send?: (batch: AnalyticsBatch) => Promise<void>
}) {
  const project = "ewatrade-mobile"
  const key = `logly:${project}:visitor`
  const now = options.now ?? (() => new Date())
  let visitor: Visitor | undefined
  let queue: AnalyticsEvent[] = []
  let timer: ReturnType<typeof setInterval> | undefined
  let inFlight: Promise<void> | undefined
  let active = false
  let lastRoute: string | undefined
  const send =
    options.send ??
    (async (batch: AnalyticsBatch) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 4000)
      try {
        const response = await fetch(options.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batch),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Analytics delivery failed")
      } finally {
        clearTimeout(timeout)
      }
    })
  const flush = () => {
    if (inFlight) return inFlight
    if (!active || !queue.length) return Promise.resolve()
    queue = queue.filter(
      (event) => now().getTime() - Date.parse(event.occurredAt) < 86400000,
    )
    const events = queue.slice(0, 25)
    if (!events.length) return Promise.resolve()
    inFlight = send({
      sentAt: now().toISOString(),
      sdk: { name: "@ishaqyusuf/logly-core", version: "0.2.0" },
      events,
    })
      .then(() => {
        const sent = new Set(events.map((event) => event.eventId))
        queue = queue.filter((event) => !sent.has(event.eventId))
      })
      .catch(() => {
        /* Keep the bounded in-memory batch for the next foreground/interval retry. */
      })
      .finally(() => {
        inFlight = undefined
      })
    return inFlight
  }
  const init = () => {
    if (active || !options.enabled) return
    try {
      const raw = options.storage?.getItem(key)
      const stored = raw ? JSON.parse(raw) : undefined
      visitor =
        stored &&
        typeof stored.id === "string" &&
        typeof stored.firstSeenOn === "string"
          ? stored
          : {
              id: options.createId(),
              firstSeenOn: now().toISOString().slice(0, 10),
              lastVisitOn: null,
            }
      options.storage?.setItem(key, JSON.stringify(visitor))
      active = true
      timer = setInterval(() => {
        void flush()
      }, 60000)
    } catch {
      active = false
    } // Storage failures must never prevent app startup.
  }
  const trackPageView = ({ route }: { route: string }) => {
    if (!active || !visitor) return
    try {
      const date = now()
      const day = date.toISOString().slice(0, 10)
      const safe = safeRoute(route)
      const newDay = visitor.lastVisitOn !== day
      if (lastRoute === safe && !newDay) return
      const visitorId = visitor.id
      const event = (name: string): AnalyticsEvent => ({
        eventId: options.createId(),
        project,
        name,
        version: 1,
        source: "browser",
        occurredAt: date.toISOString(),
        visitorId,
        route: safe,
        properties: {},
      })
      if (newDay) {
        queue.push({
          ...event("site_visit"),
          visitKind: visitor.firstSeenOn === day ? "new" : "returning",
        })
        visitor.lastVisitOn = day
        options.storage?.setItem(key, JSON.stringify(visitor))
      }
      queue.push(event("page_view"))
      queue = queue.slice(-250)
      lastRoute = safe
      void flush()
    } catch {
      /* Analytics is best-effort and never interrupts navigation. */
    }
  }
  return {
    init,
    trackPageView,
    flush,
    destroy: () => {
      active = false
      if (timer) clearInterval(timer)
      queue = []
    },
  }
}
