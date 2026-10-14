"use client"

import { type ReactNode, createContext, useContext } from "react"

const ActivityViewerContext = createContext<string | null>(null)

/** The signed-in membership, so rows can say "You" for their own actions. */
export function ActivityViewerProvider({
  membershipId,
  children,
}: {
  membershipId: string | null
  children: ReactNode
}) {
  return (
    <ActivityViewerContext.Provider value={membershipId}>
      {children}
    </ActivityViewerContext.Provider>
  )
}

export function useActivityViewer() {
  return useContext(ActivityViewerContext)
}
