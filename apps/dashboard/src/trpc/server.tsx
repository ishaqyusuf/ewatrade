import "server-only"

import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  type FetchQueryOptions,
  HydrationBoundary,
  type QueryKey,
  dehydrate,
} from "@tanstack/react-query"
import { createTRPCClient, loggerLink } from "@trpc/client"
import { httpBatchLink } from "@trpc/client/links/httpBatchLink"
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

export const trpc = createTRPCOptionsProxy<AppRouter>({
  queryClient: getQueryClient,
  client: createTRPCClient({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        async fetch(input, init) {
          const context = await getServerRequestContext()
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
            signal: dashboardReadSignal(init?.signal),
          })
        },
        async headers() {
          return (await getServerRequestContext()).headers
        },
      }),
      loggerLink({
        enabled: (opts) =>
          shouldLogDashboardTrpcOperation(opts, process.env.NODE_ENV),
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

export function prefetch<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(queryOptions: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  const queryClient = getQueryClient()

  return queryClient.prefetchQuery(queryOptions)
}
