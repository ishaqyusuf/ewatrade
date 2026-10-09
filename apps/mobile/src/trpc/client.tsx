"use client"

import { getBaseUrl } from "@/lib/base-url"
import { mobileAgeRequestHeaders } from "@/lib/mobile-age-request-headers"
import { getSession } from "@/lib/session-store"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import type { QueryClient } from "@tanstack/react-query"
import { QueryClientProvider, isServer } from "@tanstack/react-query"
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  loggerLink,
  splitLink,
} from "@trpc/client"
import { createTRPCContext } from "@trpc/tanstack-react-query"
import { useState } from "react"
import superjson from "superjson"
import { shouldLogMobileTrpcOperation } from "./log-operation"
import { makeQueryClient } from "./query-client"
import { searchPostLink } from "./search-post-link"

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>()

let browserQueryClient: QueryClient

export function clearMobileDataCache() {
  if (!browserQueryClient) return
  browserQueryClient.clear()
}

function getQueryClient() {
  if (isServer) {
    // Server: always make a new query client
    return makeQueryClient()
  }

  // Browser: make a new query client if we don't already have one
  // This is very important, so we don't re-make a new client if React
  // suspends during the initial render. This may not be needed if we
  // have a suspense boundary BELOW the creation of the query client
  if (!browserQueryClient) browserQueryClient = makeQueryClient()

  return browserQueryClient
}

function getTrpcUrl() {
  return `${getBaseUrl()}/api/trpc`
}

async function getTrpcHeaders() {
  const headers = new Map<string, string>()
  const session = getSession()
  const token = session?.token
  if (token) {
    headers.set("x-app-authorization", `Bearer ${token}`)
  }
  if (session?.profile.businessSlug) {
    headers.set("x-tenant-slug", session.profile.businessSlug)
  }
  if (session?.profile.storeId) {
    headers.set("x-store-id", session.profile.storeId)
  }
  headers.set("x-trpc-source", "mobile")
  return Object.fromEntries(headers)
}

function getAgeGateHeaders() {
  return mobileAgeRequestHeaders(getSession()?.token)
}

export function TRPCReactProvider(
  props: Readonly<{
    children: React.ReactNode
  }>,
) {
  const queryClient = getQueryClient()
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === "query" && op.path === "search.global",
          true: searchPostLink({
            url: getTrpcUrl(),
            transformer: superjson,
            headers: getTrpcHeaders,
          }),
          false: splitLink({
            condition: (op) =>
              op.path === "serviceCommerce.accountAgeStatus" ||
              op.path === "serviceCommerce.accountDeclareAgeBand",
            true: httpLink({
              url: getTrpcUrl(),
              transformer: superjson,
              headers: getAgeGateHeaders,
            }),
            false: splitLink({
              condition: (op) => op.type === "mutation",
              true: httpLink({
                url: getTrpcUrl(),
                transformer: superjson,
                headers: getTrpcHeaders,
              }),
              false: httpBatchLink({
                url: getTrpcUrl(),
                transformer: superjson,
                headers: getTrpcHeaders,
              }),
            }),
          }),
        }),
        loggerLink({
          enabled: (opts) =>
            shouldLogMobileTrpcOperation(opts, process.env.NODE_ENV),
        }),
      ],
    }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
