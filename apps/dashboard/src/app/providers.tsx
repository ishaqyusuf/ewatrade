"use client"

import { ThemeProvider } from "@/components/dashboard/theme-provider"
import { QaDashboardProvider } from "@/components/qa/qa-quick-fill"
import { TRPCReactProvider } from "@/trpc/client"
import { Toaster } from "@ewatrade/ui"
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {qaAcceleratorEnabled ? (
            <QaDashboardProvider>{children}</QaDashboardProvider>
          ) : (
            children
          )}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </TRPCReactProvider>
    </NuqsAdapter>
  )
}
