"use client"

import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { resolveTenantDomain } from "@ewatrade/utils"
import { QueryClientProvider, isServer } from "@tanstack/react-query"
import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client"
import { createTRPCContext } from "@trpc/tanstack-react-query"
import { useState } from "react"
import superjson from "superjson"
import { makeQueryClient } from "./query-client"

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>()

let browserQueryClient: ReturnType<typeof makeQueryClient> | undefined

function getQueryClient() {
  if (isServer) {
    return makeQueryClient()
  }

  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

export function clearDashboardDataCache() {
  browserQueryClient?.clear()
}

function getTenantSlugFromBrowserHost() {
  if (typeof window === "undefined") {
    return null
  }

  const result = resolveTenantDomain(window.location.host, {
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  })

  return result.kind === "tenant" ? result.tenantSlug : null
}

export function TRPCReactProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const queryClient = getQueryClient()
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          async headers() {
            const tenantSlug = getTenantSlugFromBrowserHost()

            return {
              "x-trpc-source": "react",
              ...(tenantSlug ? { "x-tenant-slug": tenantSlug } : {}),
            }
          },
        }),
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
        }),
      ],
    }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
