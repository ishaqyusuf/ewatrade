"use client"

import { getBaseUrl } from "@/lib/base-url"
import {
  getCustomerConversationSession,
  getCustomerInstallationToken,
} from "@/lib/customer-conversation-store"
import { getSession } from "@/lib/session-store"
import { captureMobileError } from "@/observability/sentry"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  splitLink,
} from "@trpc/client"
import { createTRPCContext } from "@trpc/tanstack-react-query"
import { useState } from "react"
import superjson from "superjson"

export const { TRPCProvider: CustomerTRPCProvider, useTRPC: useCustomerTRPC } =
  createTRPCContext<AppRouter>()

function customerHeaders() {
  const sessionToken = getSession()?.token
  const credential = getCustomerConversationSession()?.credentialToken
  return {
    ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
    ...(credential ? { "x-store-conversation-credential": credential } : {}),
    "x-store-conversation-installation": getCustomerInstallationToken(),
    "x-trpc-source": "customer-mobile",
  }
}

export function CustomerConversationAPIProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error) =>
            captureMobileError(error, "mobile.customer_mutation"),
        }),
        queryCache: new QueryCache({
          onError: (error) =>
            captureMobileError(error, "mobile.customer_query"),
        }),
        defaultOptions: {
          mutations: { gcTime: 0, retry: false },
          queries: { gcTime: 0, retry: false, staleTime: 0 },
        },
      }),
  )
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (operation) => operation.type === "mutation",
          true: httpLink({
            headers: customerHeaders,
            transformer: superjson,
            url: `${getBaseUrl()}/api/trpc`,
          }),
          false: httpBatchLink({
            headers: customerHeaders,
            transformer: superjson,
            url: `${getBaseUrl()}/api/trpc`,
          }),
        }),
      ],
    }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <CustomerTRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </CustomerTRPCProvider>
    </QueryClientProvider>
  )
}
