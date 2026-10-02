import type { AnalyticsConfig } from "@ishaqyusuf/logly-core"
import { boundedBatch } from "./bounded-batch"
import {
  type EventMetadata,
  isEventName,
  safeEventMetadata,
} from "./event-metadata"
import type { NativeBatch, NativeEvent } from "./native-contract"
import { safeRoute } from "./policy"

type Visitor = {
  id: string
  firstSeenOn: string
  lastVisitOn: string | null
  contextIdentity?: string | null
}
// Native deliberately uses no browser globals. IDs are installation-local and project-scoped.
export function createNativeAnalytics(options: {
  endpoint: string
  enabled: boolean
  permission?: () => boolean
  appVersion?: string
  appBuild?: string
  storage: AnalyticsConfig["storage"]
  createId: () => string
  now?: () => Date
  send?: (batch: NativeBatch) => Promise<void>
}) {
  const project = "ewatrade-mobile"
  const key = `logly:${project}:visitor`
  const now = options.now ?? (() => new Date())
  let visitor: Visitor | undefined
  let queue: NativeEvent[] = []
  let timer: ReturnType<typeof setInterval> | undefined
  let inFlight: Promise<void> | undefined
  let active = false
  let lastRoute: string | undefined
  let analyticsContext: {
    token: string
    expiresAt: number
    identityKey: string
  } | null = null
  const send =
    options.send ??
    (async (batch: NativeBatch) => {
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
  const allowed = () => {
    if (options.permission?.() !== false) return true
    queue = []
    visitor = undefined
    lastRoute = undefined
    try {
      options.storage?.removeItem(key)
    } catch {}
    return false
  }
  const flush = () => {
    if (!allowed()) return Promise.resolve()
    if (inFlight) return inFlight
    if (!active || !queue.length) return Promise.resolve()
    queue = queue.filter(
      (event) => now().getTime() - Date.parse(event.occurredAt) < 86400000,
    )
    const { batch, dropped } = boundedBatch(queue, {
      sentAt: now().toISOString(),
      sdk: { name: "@ishaqyusuf/logly-core", version: "0.3.0" },
    })
    queue = queue.filter((event) => !dropped.has(event.eventId))
    const events = batch.events
    if (!events.length) return Promise.resolve()
    let delivered = false
    inFlight = send(batch)
      .then(() => {
        delivered = true
        const sent = new Set(events.map((event) => event.eventId))
        queue = queue.filter((event) => !sent.has(event.eventId))
      })
      .catch(() => {
        /* Keep the bounded in-memory batch for the next foreground/interval retry. */
      })
      .finally(() => {
        inFlight = undefined
        if (delivered && active && queue.length) void flush()
      })
    return inFlight
  }
  const init = () => {
    if (active || !options.enabled || !allowed()) return
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
  const capture = (
    name: string,
    properties: EventMetadata,
    route: string,
    page: boolean,
  ) => {
    if (!allowed() || !isEventName(name)) return
    if (
      !active ||
      !visitor ||
      (analyticsContext && analyticsContext.expiresAt <= now().getTime())
    )
      return
    try {
      const date = now()
      const day = date.toISOString().slice(0, 10)
      const safe = safeRoute(route)
      const newDay = visitor.lastVisitOn !== day
      if (page && lastRoute === safe && !newDay) return
      const visitorId = visitor.id
      const event = (name: NativeEvent["name"]): NativeEvent => ({
        eventId: options.createId(),
        project,
        name,
        version: 1,
        source: "mobile",
        platform: "android",
        appVersion: options.appVersion,
        appBuild: options.appBuild,
        occurredAt: date.toISOString(),
        visitorId,
        route: safe,
        properties:
          name === "app_session"
            ? {}
            : safeEventMetadata({ surface: "mobile", ...properties }),
        ...(analyticsContext
          ? { analyticsContext: analyticsContext.token }
          : {}),
      })
      if (newDay) {
        queue.push({
          ...event("app_session"),
          visitKind: visitor.firstSeenOn === day ? "new" : "returning",
        })
        visitor.lastVisitOn = day
        options.storage?.setItem(key, JSON.stringify(visitor))
      }
      queue.push(event(name))
      queue = queue.slice(-250)
      if (page) lastRoute = safe
      void flush()
    } catch {
      /* Analytics is best-effort and never interrupts navigation. */
    }
  }
  return {
    init,
    setContext(context: typeof analyticsContext) {
      if (
        (analyticsContext?.identityKey ?? visitor?.contextIdentity ?? null) !==
        (context?.identityKey ?? null)
      ) {
        queue = []
        lastRoute = undefined
        if (visitor) {
          visitor = {
            id: options.createId(),
            firstSeenOn: now().toISOString().slice(0, 10),
            lastVisitOn: null,
            contextIdentity: context?.identityKey ?? null,
          }
          try {
            options.storage?.setItem(key, JSON.stringify(visitor))
          } catch {
            /* Analytics must not interrupt account switching. */
          }
        }
      }
      if (visitor) visitor.contextIdentity = context?.identityKey ?? null
      analyticsContext = context ? { ...context } : null
    },
    trackPageView({ route }: { route: string }) {
      capture("screen_view", {}, route, true)
    },
    track(
      name: string,
      properties: EventMetadata = {},
      route = lastRoute ?? "/",
    ) {
      capture(name, properties, route, false)
    },
    flush,
    destroy: () => {
      active = false
      if (timer) clearInterval(timer)
      queue = []
    },
  }
}
