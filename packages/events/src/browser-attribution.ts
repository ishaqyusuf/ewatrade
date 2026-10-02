import type { AnalyticsBatch } from "@ishaqyusuf/logly-core"
import { z } from "zod"
import { boundedBatch } from "./bounded-batch"
import {
  type EventMetadata,
  isEventName,
  safeEventMetadata,
} from "./event-metadata"
import { safeRoute } from "./policy"

export const capturedContextSchema = z
  .object({
    token: z.string().max(2048),
    expiresAt: z.number(),
    identityKey: z.string(),
  })
  .nullable()
export type CapturedContext = z.infer<typeof capturedContextSchema>
type Event = AnalyticsBatch["events"][number] & { analyticsContext?: string }

/** In-memory queue: identity is copied on capture, never supplied at flush time. */
export function createAttributedBrowserAnalytics(options: {
  storage: {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
  }
  send: (
    batch: Omit<AnalyticsBatch, "events"> & { events: Event[] },
  ) => Promise<void>
  permission?: () => boolean
  now?: () => number
  createId?: () => string
}) {
  const now = options.now ?? Date.now
  const createId = options.createId ?? (() => crypto.randomUUID())
  const project = "ewatrade-dashboard"
  const storageKey = `logly:${project}:attributed-visitor`
  let visitor:
    | {
        id: string
        firstDay: string
        lastDay?: string
        contextIdentity: string | null
      }
    | undefined
  let identity: string | null | undefined
  let lastRoute: string | undefined
  let queue: Event[] = []
  let inFlight: Promise<void> | undefined
  let active = true
  let enabled = true
  function reset() {
    queue = []
    visitor = undefined
    lastRoute = undefined
    options.storage.removeItem(storageKey)
  }
  function flush() {
    if (!enabled || options.permission?.() === false) return Promise.resolve()
    if (inFlight) return inFlight
    if (!active) return Promise.resolve()
    queue = queue.filter(
      (event) => now() - Date.parse(event.occurredAt) < 86400000,
    )
    const { batch, dropped } = boundedBatch(queue, {
      sentAt: new Date(now()).toISOString(),
      sdk: { name: "@ishaqyusuf/logly-core", version: "0.2.0" },
    })
    queue = queue.filter((event) => !dropped.has(event.eventId))
    const events = batch.events
    if (!events.length) return Promise.resolve()
    let delivered = false
    inFlight = options
      .send(batch)
      .then(() => {
        delivered = true
        const ids = new Set(events.map((event) => event.eventId))
        queue = queue.filter((event) => !ids.has(event.eventId))
      })
      .catch(() => {})
      .finally(() => {
        inFlight = undefined
        if (delivered && active && queue.length) void flush()
      })
    return inFlight
  }
  function capture(
    name: string,
    properties: EventMetadata,
    route: string,
    context: CapturedContext,
    page: boolean,
  ) {
    if (!isEventName(name)) return
    if (!enabled || options.permission?.() === false) return
    if (!active || (context && context.expiresAt <= now())) return
    if (
      typeof navigator !== "undefined" &&
      (navigator.doNotTrack === "1" ||
        (navigator as Navigator & { globalPrivacyControl?: boolean })
          .globalPrivacyControl)
    ) {
      reset()
      return
    }
    const nextIdentity = context?.identityKey ?? null
    if (identity !== undefined && identity !== nextIdentity) reset()
    identity = nextIdentity
    const date = new Date(now())
    const day = date.toISOString().slice(0, 10)
    if (!visitor) {
      try {
        const raw = options.storage.getItem(storageKey)
        const parsed = raw ? JSON.parse(raw) : null
        if (
          parsed &&
          typeof parsed.id === "string" &&
          typeof parsed.firstDay === "string" &&
          parsed.contextIdentity === nextIdentity
        )
          visitor = parsed
      } catch {}
      visitor ??= {
        id: createId(),
        firstDay: day,
        contextIdentity: nextIdentity,
      }
    }
    const safe = safeRoute(route)
    if (page && lastRoute === safe && visitor.lastDay === day) return
    const event = (name: string): Event => ({
      eventId: createId(),
      project,
      name,
      version: 1,
      source: "browser",
      occurredAt: date.toISOString(),
      visitorId: visitor?.id,
      route: safe,
      properties:
        name === "site_visit"
          ? {}
          : safeEventMetadata({ surface: "dashboard", ...properties }),
      ...(context ? { analyticsContext: context.token } : {}),
    })
    if (visitor.lastDay !== day) {
      queue.push({
        ...event("site_visit"),
        visitKind: visitor.firstDay === day ? "new" : "returning",
      })
      visitor.lastDay = day
      options.storage.setItem(storageKey, JSON.stringify(visitor))
    }
    queue.push(event(name))
    queue = queue.slice(-250)
    if (page) lastRoute = safe
    void flush()
  }
  return {
    setEnabled(value: boolean) {
      enabled = value
      if (!value) {
        reset()
        identity = undefined
      }
    },
    flush,
    reset,
    destroy() {
      active = false
      queue = []
    },
    trackPageView(route: string, context: CapturedContext) {
      capture("page_view", {}, route, context, true)
    },
    track(
      name: string,
      properties: EventMetadata,
      context: CapturedContext,
      route = "/",
    ) {
      capture(name, properties, route, context, false)
    },
  }
}
