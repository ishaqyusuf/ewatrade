"use client"

import { TRPCProvider } from "@/trpc/client"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { type ReactNode, useState } from "react"
import superjson from "superjson"

/** Public proof tokens stay in POST bodies; no merchant cookies or analytics. */
export function PaymentProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 0 } },
      }),
  )
  const [client] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          methodOverride: "POST",
          transformer: superjson,
          fetch(input, init) {
            return fetch(input, {
              ...init,
              credentials: "omit",
              cache: "no-store",
              referrerPolicy: "no-referrer",
              redirect: "error",
              signal: AbortSignal.any([
                ...(init?.signal ? [init.signal] : []),
                AbortSignal.timeout(15_000),
              ]),
            })
          },
        }),
      ],
    }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
