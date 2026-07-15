import "server-only"

import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { resolveTenantDomain } from "@ewatrade/utils"
import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
import { createTRPCClient, loggerLink } from "@trpc/client"
import { httpBatchLink } from "@trpc/client/links/httpBatchLink"
import {
  type TRPCQueryOptions,
  createTRPCOptionsProxy,
} from "@trpc/tanstack-react-query"
import { headers } from "next/headers"
import { cache } from "react"
import superjson from "superjson"
import { makeQueryClient } from "./query-client"

export const getQueryClient = cache(makeQueryClient)

async function getRequestOrigin() {
  const requestHeaders = await headers()
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https")

  if (!host) {
    return null
  }

  return `${protocol}://${host}`
}

async function getTenantSlugFromRequest() {
  const requestHeaders = await headers()
  const existingTenantSlug = requestHeaders.get("x-tenant-slug")

  if (existingTenantSlug) {
    return existingTenantSlug
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")

  if (!host) {
    return null
  }

  const result = resolveTenantDomain(host, {
    platformDomain:
      process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ??
      process.env.PLATFORM_DOMAIN ??
      "ewatrade.com",
  })

  return result.kind === "tenant" ? result.tenantSlug : null
}

export const trpc = createTRPCOptionsProxy<AppRouter>({
  queryClient: getQueryClient,
  client: createTRPCClient({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson as any,
        async fetch(input, init) {
          const origin = await getRequestOrigin()
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url
          const resolvedUrl =
            url.startsWith("http") || !origin ? url : `${origin}${url}`

          return fetch(resolvedUrl, init)
        },
        async headers() {
          const requestHeaders = await headers()
          const tenantSlug = await getTenantSlugFromRequest()
          const cookie = requestHeaders.get("cookie")
          const authorization = requestHeaders.get("authorization")

          return {
            "x-trpc-source": "rsc",
            ...(cookie ? { cookie } : {}),
            ...(authorization ? { authorization } : {}),
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
})

export function HydrateClient({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  )
}

export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: T,
) {
  const queryClient = getQueryClient()

  if (queryOptions.queryKey[1]?.type === "infinite") {
    return queryClient.prefetchInfiniteQuery(queryOptions as any)
  }

  return queryClient.prefetchQuery(queryOptions)
}

export async function batchPrefetch<
  T extends ReturnType<TRPCQueryOptions<any>>,
>(queryOptionsArray: T[]) {
  const queryClient = getQueryClient()

  await Promise.allSettled(
    queryOptionsArray.map((queryOptions) => {
      if (queryOptions.queryKey[1]?.type === "infinite") {
        return queryClient.prefetchInfiniteQuery(queryOptions as any)
      }

      return queryClient.prefetchQuery(queryOptions)
    }),
  )
}
