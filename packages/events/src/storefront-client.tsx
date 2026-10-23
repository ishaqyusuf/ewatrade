"use client"

import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { createAttributedBrowserAnalytics } from "./browser-attribution"
import { createBrowserStorage } from "./browser-storage"
import type { EventMetadata } from "./event-metadata"
import { EventsContext, useEvents } from "./events-context"

const clickEvents = new Set([
  "storefront_item_viewed",
  "storefront_whatsapp_clicked",
  "storefront_request_started",
  "storefront_backlink_clicked",
])
const publicRoutes = new Set(["/", "/about", "/service-request"])
const ItemViewContext = createContext<(id: string, kind?: string) => void>(
  () => {},
)

export function StorefrontEventsRuntime({
  enabled,
  pathname,
  children,
}: {
  enabled: boolean
  pathname: string
  children: ReactNode
}) {
  const track = useRef<(name: string, properties?: EventMetadata) => void>(
    () => {},
  )
  const canCollect = useRef<() => boolean>(() => false)
  const listeners = useRef(new Set<() => void>())
  const viewedItems = useRef(new Set<string>())
  const observeItem = useMemo(
    () => (id: string, kind?: string) => {
      if (!canCollect.current() || viewedItems.current.has(id)) return
      viewedItems.current.add(id)
      track.current("storefront_item_viewed", { category: kind })
    },
    [],
  )
  const value = useMemo(
    () => ({
      track: (name: string, properties?: EventMetadata) =>
        track.current(name, properties),
      canCollect: () => canCollect.current(),
      workflow: () => {},
      whenReady(callback: () => void) {
        listeners.current.add(callback)
        if (canCollect.current()) callback()
        return () => {
          listeners.current.delete(callback)
        }
      },
    }),
    [],
  )
  useEffect(() => {
    if (!enabled || !publicRoutes.has(pathname)) return
    let ready = false
    let disposed = false
    let sequence = 0
    const privacyAllowed = () =>
      navigator.doNotTrack !== "1" &&
      !(navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl
    const client = createAttributedBrowserAnalytics({
      project: "ewatrade-storefront",
      storage: createBrowserStorage(),
      permission: () => ready && privacyAllowed(),
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
    canCollect.current = () => ready && privacyAllowed()
    track.current = (name, properties = {}) => {
      if (canCollect.current()) client.track(name, properties, null, pathname)
    }
    const refresh = async () => {
      ready = false
      const current = ++sequence
      try {
        const response = await fetch("/api/analytics/context", {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        })
        if (disposed || current !== sequence) return
        if (!response.ok) {
          client.setEnabled(false)
          return
        }
        const decision: unknown = await response.json()
        if (disposed || current !== sequence) return
        ready = Boolean(
          decision &&
            typeof decision === "object" &&
            "enabled" in decision &&
            decision.enabled === true &&
            privacyAllowed(),
        )
        client.setEnabled(ready)
        if (!ready) return
        client.trackPageView(pathname, null)
        for (const listener of listeners.current) {
          try {
            listener()
          } catch {}
        }
        void client.flush()
      } catch {
        if (!disposed && current === sequence) client.setEnabled(false)
      }
    }
    const click = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-storefront-event]")
          : null
      const name = target?.dataset.storefrontEvent
      if (name && clickEvents.has(name))
        track.current(name, { category: target?.dataset.storefrontKind })
    }
    const focus = () => {
      void refresh()
    }
    const flush = () => {
      void client.flush()
    }
    document.addEventListener("click", click)
    window.addEventListener("focus", focus)
    window.addEventListener("pagehide", flush)
    const timer = setInterval(focus, 60000)
    void refresh()
    return () => {
      disposed = true
      ready = false
      track.current = () => {}
      canCollect.current = () => false
      document.removeEventListener("click", click)
      window.removeEventListener("focus", focus)
      window.removeEventListener("pagehide", flush)
      clearInterval(timer)
      client.destroy()
      viewedItems.current.clear()
    }
  }, [enabled, pathname])
  return (
    <EventsContext.Provider value={value}>
      <ItemViewContext.Provider value={observeItem}>
        {children}
      </ItemViewContext.Provider>
    </EventsContext.Provider>
  )
}

/** Only explicit successful share/request callbacks call this; no form content is read. */
export { useEvents as useStorefrontEvents }

export function useStorefrontItemView(
  item: { id: string; kind: string } | null,
) {
  const events = useEvents()
  const observeItem = useContext(ItemViewContext)
  const id = item?.id
  const kind = item?.kind
  useEffect(() => {
    if (!id) return
    let captured = false
    return events.whenReady(() => {
      if (captured) return
      captured = true
      observeItem(id, kind)
    })
  }, [events, id, kind, observeItem])
}
