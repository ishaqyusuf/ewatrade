import "server-only"

import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { cache } from "react"
import superjson from "superjson"

function configuredOrigin(value: string | undefined) {
  if (!value) throw new Error("Public payment address is not configured")
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Public payment address must be a configured HTTPS origin")
  }
  return url.origin
}

/** Never derive a fetch destination or social image from an incoming Host header. */
export function publicPaymentOrigin() {
  return configuredOrigin(
    process.env.PAYMENT_LINK_PUBLIC_ORIGIN ??
      process.env.NEXT_PUBLIC_DASHBOARD_URL,
  )
}

export const readPublicPayment = cache(async (token: string) => {
  if (!token || token.length > 220) return null
  try {
    const origin = configuredOrigin(
      process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL,
    )
    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${origin}/api/trpc`,
          methodOverride: "POST",
          transformer: superjson,
          fetch(input, init) {
            return fetch(input, {
              ...init,
              credentials: "omit",
              cache: "no-store",
              redirect: "error",
              signal: AbortSignal.timeout(10_000),
            })
          },
        }),
      ],
    })
    return await client.businessBanking.paymentLink.query({ token })
  } catch {
    // The interactive page retains an explicit retry for transient failures.
    return null
  }
})
