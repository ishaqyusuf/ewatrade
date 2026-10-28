import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { type TRPCLink, httpBatchLink, splitLink } from "@trpc/client"
import superjson from "superjson"

type BatchFetch = NonNullable<
  Parameters<typeof httpBatchLink<AppRouter>>[0]["fetch"]
>

/**
 * The only public-page procedures that may carry the common User/Session
 * cookie. The server derives the customer from that session; the client never
 * sends actor, customer, account or session IDs. Everything else on the public
 * page (link, ordinary report, reference, status, attempts) stays credential-free.
 * reportPaymentWithRefund is the same report operation, used only when the
 * customer adds refund bank details, which the server binds to that session.
 */
const CUSTOMER_FUNDS_OPERATIONS = new Map<string, "query" | "mutation">([
  ["businessBanking.customerFunds", "query"],
  ["businessBanking.applyCustomerCredit", "mutation"],
  ["businessBanking.reportPaymentWithRefund", "mutation"],
])

/** Exact path and procedure type; any other operation stays `omit`. */
export function isCustomerFundsOperation(op: { path: string; type: string }) {
  return CUSTOMER_FUNDS_OPERATIONS.get(op.path) === op.type
}

/**
 * Public proof tokens stay in POST bodies; no analytics link. Funds and public
 * operations use separate batch links so one HTTP request never mixes them.
 */
export function publicPaymentLinks(
  baseFetch: BatchFetch = fetch,
): TRPCLink<AppRouter>[] {
  const batchLink = (credentials: "omit" | "same-origin") =>
    httpBatchLink({
      url: "/api/trpc",
      methodOverride: "POST",
      transformer: superjson,
      fetch(input, init) {
        return baseFetch(input, {
          ...init,
          credentials,
          cache: "no-store",
          referrerPolicy: "no-referrer",
          redirect: "error",
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(15_000),
          ]),
        })
      },
    })
  return [
    splitLink({
      condition: isCustomerFundsOperation,
      true: batchLink("same-origin"),
      false: batchLink("omit"),
    }),
  ]
}
