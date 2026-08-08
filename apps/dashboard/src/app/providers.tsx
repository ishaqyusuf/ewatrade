"use client"

import { TRPCReactProvider } from "@/trpc/client"
import { NuqsAdapter } from "nuqs/adapters/next/app"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <TRPCReactProvider>{children}</TRPCReactProvider>
    </NuqsAdapter>
  )
}
