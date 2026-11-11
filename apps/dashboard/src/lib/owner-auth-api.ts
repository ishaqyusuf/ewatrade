import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  getTrustedPrivacyNetworkSource,
  getTrustedQaNetworkSource,
} from "@ewatrade/utils/qa-network-source"
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import type { NextRequest } from "next/server"
import superjson from "superjson"

/** Server-side client for the API's owner email/phone code procedures. */
export function createOwnerAuthApi(request: NextRequest, source: string) {
  const origin = (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3095"
  ).replace(/\/$/, "")
  const internalKey = process.env.INTERNAL_API_KEY?.trim()
  const network = {
    env: process.env,
    getHeader: (name: string) => request.headers.get(name),
  }
  const clientAddress =
    getTrustedPrivacyNetworkSource(network) ??
    getTrustedQaNetworkSource(network)
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${origin}/api/trpc`,
        transformer: superjson,
        headers: () => ({
          "x-trpc-source": source,
          ...(internalKey && clientAddress
            ? {
                "x-ewatrade-client-ip": clientAddress,
                "x-internal-key": internalKey,
              }
            : {}),
        }),
      }),
    ],
  })
}

/** JSON POSTs must come from this dashboard's own origin. Malformed origins fail closed. */
export function isSameOriginJsonPost(request: NextRequest) {
  const origin = request.headers.get("origin")
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  let sameOrigin = false
  try {
    sameOrigin = Boolean(origin && new URL(origin).host === host)
  } catch {
    /* Malformed origins fail closed. */
  }
  return (
    sameOrigin &&
    Boolean(request.headers.get("content-type")?.startsWith("application/json"))
  )
}
