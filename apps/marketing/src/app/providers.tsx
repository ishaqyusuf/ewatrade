"use client"

import { QaWebAccelerator } from "@/components/qa/qa-web-accelerator"
import { TRPCReactProvider } from "@/trpc/client"
import { NotificationsProvider } from "@ewatrade/notifications-react"

export function Providers({
  children,
  qaAcceleratorEnabled,
}: {
  children: React.ReactNode
  qaAcceleratorEnabled: boolean
}) {
  const content = qaAcceleratorEnabled ? (
    <QaWebAccelerator>{children}</QaWebAccelerator>
  ) : (
    children
  )

  return (
    <TRPCReactProvider>
      <NotificationsProvider>{content}</NotificationsProvider>
    </TRPCReactProvider>
  )
}
