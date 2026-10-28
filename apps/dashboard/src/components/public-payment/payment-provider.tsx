"use client"

import { TRPCProvider } from "@/trpc/client"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { type ReactNode, useState } from "react"
import { publicPaymentLinks } from "./funds-transport"

/**
 * Public proof tokens stay in POST bodies. Only the two customer-funds
 * procedures send the same-origin session cookie; see funds-transport.ts.
 */
export function PaymentProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 0 } },
      }),
  )
  const [client] = useState(() =>
    createTRPCClient<AppRouter>({ links: publicPaymentLinks() }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
