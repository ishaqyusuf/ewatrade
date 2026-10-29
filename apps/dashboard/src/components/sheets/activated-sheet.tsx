"use client"

import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react"

const ActiveSheet = createContext(false)

export function useActiveSheet() {
  return useContext(ActiveSheet)
}

/** Keep a loaded controller alive for its own close/focus/draft lifecycle. */
export function ActivatedSheet({
  active,
  children,
}: { active: boolean; children: ReactNode }) {
  const [activated, setActivated] = useState(active)
  useEffect(() => {
    if (active) setActivated(true)
  }, [active])
  return active || activated ? (
    <ActiveSheet.Provider value={active}>{children}</ActiveSheet.Provider>
  ) : null
}

export function SheetCodeLoading() {
  return useContext(ActiveSheet) ? (
    <output
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg"
    >
      Opening…
    </output>
  ) : null
}
