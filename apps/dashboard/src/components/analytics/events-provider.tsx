"use client"
import { EventsProvider } from "@ewatrade/events/client"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

export function DashboardEventsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <EventsProvider surface="dashboard" pathname={pathname ?? "/"}>
      {children}
    </EventsProvider>
  )
}
