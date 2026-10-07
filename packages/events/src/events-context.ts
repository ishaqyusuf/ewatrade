"use client"
import { createContext, useContext } from "react"
import type {
  DashboardBrowserAction,
  WorkflowPhase,
} from "./dashboard-workflows"
import type { EventMetadata } from "./event-metadata"

export const EventsContext = createContext<{
  whenReady(callback: () => void): () => void
  canCollect(): boolean
  workflow(
    action: DashboardBrowserAction,
    phase: WorkflowPhase,
    metadata?: EventMetadata,
  ): void
  track(name: string, properties?: EventMetadata): void
}>({
  track: () => {},
  canCollect: () => false,
  whenReady: () => () => {},
  workflow: () => {},
})
export function useEvents() {
  return useContext(EventsContext)
}
