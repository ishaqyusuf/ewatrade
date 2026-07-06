"use client"

import { TRPCReactProvider } from "@/trpc/client"
import { NotificationsProvider } from "@ewatrade/notifications-react"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TRPCReactProvider>
      <NotificationsProvider>{children}</NotificationsProvider>
    </TRPCReactProvider>
  )
}
