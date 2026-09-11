"use client"

import { QaDashboardProvider } from "@/components/qa/qa-quick-fill"
import { TRPCReactProvider } from "@/trpc/client"
import { NuqsAdapter } from "nuqs/adapters/next/app"

export function Providers({
  children,
  qaAcceleratorEnabled,
}: {
  children: React.ReactNode
  qaAcceleratorEnabled: boolean
}) {
  return (
    <NuqsAdapter>
      <TRPCReactProvider>
        {qaAcceleratorEnabled ? (
          <QaDashboardProvider>{children}</QaDashboardProvider>
        ) : (
          children
        )}
      </TRPCReactProvider>
    </NuqsAdapter>
  )
}
