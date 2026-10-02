"use client"
import { createContext, useContext } from "react"
import type { EventMetadata } from "./event-metadata"

export const EventsContext = createContext<{
  track(name: string, properties?: EventMetadata): void
}>({ track: () => {} })
export function useEvents() {
  return useContext(EventsContext)
}
