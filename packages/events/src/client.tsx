"use client"
import type { AnalyticsBatch } from "@ishaqyusuf/logly-core"
import { AnalyticsProvider } from "@ishaqyusuf/logly-next"
import type { ReactNode } from "react"
import { safeBatch } from "./policy"

const project = process.env.NEXT_PUBLIC_LOGLY_PROJECT ?? "ewatrade-web"
async function transport(batch: AnalyticsBatch) {
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
export function EventsProvider({ children }: { children: ReactNode }) {
  return (
    <AnalyticsProvider
      project={project}
      endpoint="/api/analytics"
      disabled={process.env.NEXT_PUBLIC_LOGLY_ENABLED !== "true"}
      respectPrivacySignals
      autoTrackPageViews
      transport={transport}
    >
      {children}
    </AnalyticsProvider>
  )
}
