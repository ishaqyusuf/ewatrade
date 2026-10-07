"use client"
import type {
  AnalyticsBatch,
  AnalyticsPermission,
} from "@ishaqyusuf/logly-core"
import {
  AnalyticsProvider,
  useAnalytics,
  useTrack,
} from "@ishaqyusuf/logly-next"
import { type ReactNode, useEffect, useMemo, useRef } from "react"
import { createBrowserStorage } from "./browser-storage"
import { DashboardEventsRuntime } from "./dashboard-runtime"
import {
  type EventMetadata,
  isEventName,
  safeEventMetadata,
} from "./event-metadata"
import { EventsContext } from "./events-context"
import { safeBatch } from "./policy"
import { type WebSurface, webSurfaces } from "./surfaces"

const storage = createBrowserStorage()

async function transport(batch: AnalyticsBatch, project: string) {
  const sanitized = safeBatch(batch, project)
  if (!sanitized.events.length) return
  const response = await fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sanitized),
    keepalive: true,
  })
  if (!response.ok) throw new Error("Analytics delivery failed")
}
export function EventsProvider({
  children,
  surface,
  pathname = "/",
}: { children: ReactNode; surface?: WebSurface; pathname?: string }) {
  const project = surface
    ? webSurfaces[surface].project
    : (process.env.NEXT_PUBLIC_LOGLY_PROJECT ?? "ewatrade-web")
  const permission = useRef<AnalyticsPermission>(
    surface === "marketing" ? "undecided" : "allowed",
  )
  const enabled =
    surface === "dashboard"
      ? process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED === "true"
      : surface === "marketing"
        ? process.env.NEXT_PUBLIC_LOGLY_MARKETING_ENABLED === "true"
        : process.env.NEXT_PUBLIC_LOGLY_ENABLED === "true"
  if (surface === "dashboard")
    return (
      <DashboardEventsRuntime enabled={enabled} pathname={pathname}>
        {children}
      </DashboardEventsRuntime>
    )
  return (
    <AnalyticsProvider
      project={project}
      endpoint="/api/analytics"
      disabled={!enabled}
      permission={() => permission.current}
      storage={storage}
      respectPrivacySignals
      autoTrackPageViews
      transport={(batch) => transport(batch, project)}
    >
      <AnonymousEventsBridge>{children}</AnonymousEventsBridge>
      {surface === "marketing" && enabled ? (
        <MarketingAnalyticsPolicy permission={permission} />
      ) : null}
    </AnalyticsProvider>
  )
}

export { useEvents } from "./events-context"

function AnonymousEventsBridge({ children }: { children: ReactNode }) {
  const track = useTrack()
  const value = useMemo(
    () => ({
      canCollect: () => false,
      whenReady: () => () => {},
      workflow: () => {},
      track(name: string, properties: EventMetadata = {}) {
        if (isEventName(name)) track(name, safeEventMetadata(properties))
      },
    }),
    [track],
  )
  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  )
}

function MarketingAnalyticsPolicy({
  permission,
}: { permission: { current: AnalyticsPermission } }) {
  const client = useAnalytics()
  useEffect(() => {
    let disposed = false
    let sequence = 0
    const refresh = async () => {
      const current = ++sequence
      permission.current = "undecided"
      try {
        const response = await fetch("/api/analytics/context", {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        })
        if (!response.ok) return
        const decision: unknown = await response.json()
        if (
          disposed ||
          current !== sequence ||
          !decision ||
          typeof decision !== "object" ||
          !("enabled" in decision) ||
          typeof decision.enabled !== "boolean"
        )
          return
        permission.current = decision.enabled ? "allowed" : "denied"
        if (!decision.enabled) {
          client.reset()
          return
        }
        client.init()
        client.trackPageView()
      } catch {
        /* Unresolved policy pauses optional analytics. */
      }
    }
    const capture = () => {
      void refresh()
    }
    capture()
    const timer = setInterval(capture, 60000)
    window.addEventListener("focus", capture)
    return () => {
      disposed = true
      permission.current = "undecided"
      clearInterval(timer)
      window.removeEventListener("focus", capture)
    }
  }, [client, permission])
  return null
}
