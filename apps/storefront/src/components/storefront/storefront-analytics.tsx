"use client"
import { StorefrontEventsRuntime } from "@ewatrade/events/storefront-client"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

export function StorefrontAnalytics({ children }: { children: ReactNode }) {
  return (
    <StorefrontEventsRuntime
      enabled={process.env.NEXT_PUBLIC_LOGLY_STOREFRONT_ENABLED === "true"}
      pathname={usePathname() ?? "/"}
    >
      {children}
    </StorefrontEventsRuntime>
  )
}
