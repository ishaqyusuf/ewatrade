import "server-only"

import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { headers } from "next/headers"
import superjson from "superjson"

async function getRequestOrigin() {
  const requestHeaders = await headers()
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https")

  return host ? `${protocol}://${host}` : null
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
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
      headers: { "x-trpc-source": "rsc" },
    }),
  ],
})
