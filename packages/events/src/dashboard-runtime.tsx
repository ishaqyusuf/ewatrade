"use client"
import { type ReactNode, useEffect, useMemo, useRef } from "react"
import { z } from "zod"
import {
  type CapturedContext,
  capturedContextSchema,
  createAttributedBrowserAnalytics,
} from "./browser-attribution"
import { createBrowserStorage } from "./browser-storage"
import type { EventMetadata } from "./event-metadata"
import { EventsContext } from "./events-context"

export function DashboardEventsRuntime({
  enabled,
  pathname,
  children,
}: { enabled: boolean; pathname: string; children: ReactNode }) {
  const track = useRef<(name: string, properties?: EventMetadata) => void>(
    () => {},
  )
  const value = useMemo(
    () => ({
      track: (name: string, properties?: EventMetadata) =>
        track.current(name, properties),
    }),
    [],
  )
  const refresh = useRef<((pathname: string) => void) | null>(null)
  const route = useRef(pathname)
  route.current = pathname
  useEffect(() => {
    if (!enabled) return
    let contextReady = false
    const client = createAttributedBrowserAnalytics({
      permission: () => contextReady,
      storage: createBrowserStorage(),
      send: async (batch) => {
        const response = await fetch("/api/analytics", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batch),
          keepalive: true,
        })
        if (!response.ok) throw new Error("Analytics unavailable")
      },
    })
    let currentContext: CapturedContext = null
    track.current = (name, properties = {}) => {
      if (contextReady)
        client.track(name, properties, currentContext, route.current)
    }
    let disposed = false
    let sequence = 0
    const capture = async () => {
      contextReady = false
      const current = ++sequence
      try {
        const response = await fetch("/api/analytics/context", {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        })
        if (!response.ok) return
        const decision: unknown = await response.json()
        const parsed = z
          .object({ enabled: z.boolean(), context: capturedContextSchema })
          .safeParse(decision)
        if (disposed || current !== sequence || !parsed.success) return
        client.setEnabled(parsed.data.enabled)
        if (!parsed.data.enabled) {
          currentContext = null
          return
        }
        const context = capturedContextSchema.safeParse(parsed.data.context)
        if (!disposed && current === sequence && context.success) {
          currentContext = context.data
          contextReady = true
          client.trackPageView(route.current ?? "/", context.data)
          void client.flush()
        }
      } catch {
        /* Identity failure never blocks navigation or reuses stale context. */
      }
    }
    refresh.current = (pathname) => {
      route.current = pathname
      void capture()
    }
    void capture()
    const timer = setInterval(() => {
      void capture()
      void client.flush()
    }, 60000)
    const focus = () => {
      void capture()
    }
    window.addEventListener("focus", focus)
    return () => {
      disposed = true
      track.current = () => {}
      refresh.current = null
      clearInterval(timer)
      window.removeEventListener("focus", focus)
      client.destroy()
    }
  }, [enabled])
  useEffect(() => {
    refresh.current?.(pathname)
  }, [pathname])
  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  )
}
