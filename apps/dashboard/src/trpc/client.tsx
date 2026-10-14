"use client"

import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { useEvents } from "@ewatrade/events/client"
import { resolveTenantDomain } from "@ewatrade/utils"
import { QueryClientProvider, isServer } from "@tanstack/react-query"
import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client"
import { createTRPCContext } from "@trpc/tanstack-react-query"
import { useState } from "react"
import superjson from "superjson"
import { dashboardAnalyticsLink } from "./analytics-link"
import { shouldLogDashboardTrpcOperation } from "./log-operation"
import { makeQueryClient } from "./query-client"

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>()

let browserQueryClient: ReturnType<typeof makeQueryClient> | undefined

function getQueryClient() {
  if (isServer) {
    return makeQueryClient()
  }

  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

// Bumped on every clear (sign-out, account, business or Store switch): async
// work started before it must not touch the cache afterwards.
let dataCacheGeneration = 0
export function getDataCacheGeneration() {
  return dataCacheGeneration
}

export function clearDashboardDataCache() {
  dataCacheGeneration += 1
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
  const events = useEvents()
  const queryClient = getQueryClient()
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        dashboardAnalyticsLink<AppRouter>(events.track),
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          async headers() {
            const tenantSlug = getTenantSlugFromBrowserHost()

            return {
              "x-trpc-source": "react",
              "x-assistant-client": "dashboard",
              "x-ewatrade-analytics": events.canCollect()
                ? "allowed"
                : "denied",
              ...(tenantSlug ? { "x-tenant-slug": tenantSlug } : {}),
            }
          },
        }),
        loggerLink({
          enabled: (opts) =>
            shouldLogDashboardTrpcOperation(opts, process.env.NODE_ENV),
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
