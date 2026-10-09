"use client"

import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { RAIL_LABELS_COOKIE, RAIL_WIDTH } from "./rail-model"

type ShellContextValue = {
  railLabels: boolean
  toggleRailLabels: () => void
}

const ShellContext = createContext<ShellContextValue>({
  railLabels: false,
  toggleRailLabels: () => {},
})

export function useDashboardShell() {
  return useContext(ShellContext)
}

function persistRailLabels(railLabels: boolean) {
  try {
    document.cookie = `${RAIL_LABELS_COOKIE}=${railLabels ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`
  } catch {
    // Cookies blocked: the choice still applies for this visit.
  }
}

/**
 * Holds the rail's labels mode and exposes its width as
 * `--dashboard-rail-width` so the rail and page offset stay in step.
 */
export function DashboardShell({
  children,
  initialRailLabels,
}: {
  children: ReactNode
  initialRailLabels: boolean
}) {
  const [railLabels, setRailLabels] = useState(initialRailLabels)
  const toggleRailLabels = useCallback(() => {
    const next = !railLabels
    setRailLabels(next)
    persistRailLabels(next)
  }, [railLabels])
  const value = useMemo(
    () => ({ railLabels, toggleRailLabels }),
    [railLabels, toggleRailLabels],
  )

  return (
    <ShellContext.Provider value={value}>
      <div
        className="relative min-h-screen bg-background"
        data-rail-labels={railLabels}
        style={
          {
            "--dashboard-rail-width": `${railLabels ? RAIL_WIDTH.labels : RAIL_WIDTH.icons}px`,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </ShellContext.Provider>
  )
}
