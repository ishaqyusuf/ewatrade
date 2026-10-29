"use client"

import { captureDashboardError } from "@/observability/sentry"
import { Button } from "@ewatrade/ui"
import { type ComponentType, useEffect, useRef, useState } from "react"
import { useActiveSheet } from "./activated-sheet"

export async function loadSheetCode<Props extends object>(
  loader: () => Promise<ComponentType<Props>>,
  placement: "overlay" | "body" = "overlay",
): Promise<ComponentType<Props>> {
  try {
    return await loader()
  } catch (error) {
    captureDashboardError(error, "sheet.code.load")
  }

  // Next caches the resolved component. Keep only recovered code, never props.
  let recovered: ComponentType<Props> | null = null
  let inFlight: Promise<ComponentType<Props>> | null = null
  function retryCode() {
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(loader)
        .then((component) => {
          recovered = component
          return component
        })
        .finally(() => {
          inFlight = null
        })
    }
    return inFlight
  }

  return function SheetCodeRecovery(props: Props) {
    const active = useActiveSheet()
    const visible = placement === "body" || active
    const [Loaded, setLoaded] = useState(() => recovered)
    const [pending, setPending] = useState(false)
    const busy = useRef(false)
    const alive = useRef(false)
    const visibleRef = useRef(visible)
    const panel = useRef<HTMLDivElement>(null)
    const opener = useRef<HTMLElement | null>(null)
    useEffect(() => {
      alive.current = true
      return () => {
        alive.current = false
      }
    }, [])
    useEffect(() => {
      visibleRef.current = visible
      if (visible && document.activeElement instanceof HTMLElement) {
        opener.current = document.activeElement
      }
    }, [visible])

    async function retry() {
      if (busy.current) return
      busy.current = true
      setPending(true)
      try {
        const component = await retryCode()
        if (!alive.current) return
        // A whole sheet must capture its opener, not a disappearing Retry button.
        if (
          visibleRef.current &&
          panel.current?.contains(document.activeElement) &&
          opener.current?.isConnected
        ) {
          opener.current.focus()
        }
        setLoaded(() => component)
      } catch (error) {
        captureDashboardError(error, "sheet.code.load")
      } finally {
        busy.current = false
        if (alive.current) setPending(false)
      }
    }

    if (Loaded) return <Loaded {...props} />
    if (!visible) return null
    return (
      <div
        ref={panel}
        role="alert"
        className={
          placement === "overlay"
            ? "fixed bottom-4 right-4 z-50 space-y-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg"
            : "space-y-3 py-4 text-sm"
        }
      >
        <p>Couldn’t open this panel.</p>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            void retry()
          }}
        >
          {pending ? "Opening…" : "Try again"}
        </Button>
      </div>
    )
  }
}
