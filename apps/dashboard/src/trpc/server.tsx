import "server-only"

import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  type FetchQueryOptions,
  HydrationBoundary,
  type QueryKey,
  dehydrate,
} from "@tanstack/react-query"
import { createTRPCClient, httpBatchStreamLink, loggerLink } from "@trpc/client"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { headers } from "next/headers"
import { cache } from "react"
import superjson from "superjson"
import { shouldLogDashboardTrpcOperation } from "./log-operation"
import { makeQueryClient } from "./query-client"
import {
  buildDashboardRequestContext,
  dashboardReadSignal,
} from "./request-context-headers"

export const getQueryClient = cache(makeQueryClient)

const getServerRequestContext = cache(async () =>
  buildDashboardRequestContext(await headers(), process.env),
)

// A batch must belong to one render request, never to the module singleton.
export const getServerClient = cache(() => {
  const requestContext = getServerRequestContext()
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchStreamLink({
        url: "/api/trpc",
        transformer: superjson,
        async fetch(input, init) {
          const context = await requestContext
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url
          const resolvedUrl = url.startsWith("http")
            ? url
            : `${context.apiOrigin}${url}`

          return fetch(resolvedUrl, {
            ...init,
            cache: "no-store",
            signal: dashboardReadSignal(init?.signal),
          })
        },
        async headers() {
          return (await requestContext).headers
        },
      }),
      loggerLink({
        enabled: (opts) =>
          shouldLogDashboardTrpcOperation(opts, process.env.NODE_ENV),
      }),
    ],
  })
})

export const trpc = createTRPCOptionsProxy<AppRouter>({
  queryClient: getQueryClient,
  get client() {
    return getServerClient()
  },
})

export function HydrateClient({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  )
}

export function prefetch<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(queryOptions: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  const queryClient = getQueryClient()

  return queryClient.prefetchQuery(queryOptions)
}
