import "server-only"

import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import superjson from "superjson"

import { resolveStorefrontApiOrigin } from "@/lib/api-origin"

const apiOrigin = resolveStorefrontApiOrigin({
  apiUrl: process.env.API_URL,
  publicApiUrl: process.env.NEXT_PUBLIC_API_URL,
})

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${apiOrigin}/api/trpc`,
      transformer: superjson,
      headers: { "x-trpc-source": "rsc" },
    }),
  ],
})
