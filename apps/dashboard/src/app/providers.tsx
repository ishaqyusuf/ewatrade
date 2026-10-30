"use client"

import { ThemeProvider } from "@/components/dashboard/theme-provider"
import { QaDashboardProvider } from "@/components/qa/qa-quick-fill"
import { TRPCReactProvider } from "@/trpc/client"
import { Toaster } from "@ewatrade/ui/sonner"
import { NuqsAdapter } from "nuqs/adapters/next/app"

export function Providers({
  children,
  qaAcceleratorEnabled,
}: {
  children: React.ReactNode
  qaAcceleratorEnabled: boolean | Promise<boolean>
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
          <QaDashboardProvider enabled={qaAcceleratorEnabled}>
            {children}
          </QaDashboardProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </TRPCReactProvider>
    </NuqsAdapter>
  )
}
