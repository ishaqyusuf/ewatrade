"use client"
import type { AnalyticsBatch } from "@ishaqyusuf/logly-core"
import { AnalyticsProvider } from "@ishaqyusuf/logly-next"
import type { ReactNode } from "react"
import { createBrowserStorage } from "./browser-storage"
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
}: { children: ReactNode; surface?: WebSurface }) {
  const project = surface
    ? webSurfaces[surface].project
    : (process.env.NEXT_PUBLIC_LOGLY_PROJECT ?? "ewatrade-web")
  const enabled =
    surface === "dashboard"
      ? process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED === "true"
      : surface === "marketing"
        ? process.env.NEXT_PUBLIC_LOGLY_MARKETING_ENABLED === "true"
        : process.env.NEXT_PUBLIC_LOGLY_ENABLED === "true"
  return (
    <AnalyticsProvider
      project={project}
      endpoint="/api/analytics"
      disabled={!enabled}
      storage={storage}
      respectPrivacySignals
      autoTrackPageViews
      transport={(batch) => transport(batch, project)}
    >
      {children}
    </AnalyticsProvider>
  )
}
