import { TRPCClientError } from "@trpc/client"

const MAX_QUERY_RETRIES = 1

function isTerminalStatus(status: number) {
  return status >= 400 && status < 500 && status !== 408
}

export async function fetchDashboardRead(...args: Parameters<typeof fetch>) {
  const response = await fetch(...args)
  // A gateway HTML response loses its HTTP status when tRPC tries to parse it.
  // Leave JSON responses to tRPC so typed error data and public messages survive.
  if (
    isTerminalStatus(response.status) &&
    !response.headers.get("content-type")?.includes("json")
  ) {
    void response.body?.cancel().catch(() => {})
    throw TRPCClientError.from(new Error("The API rejected this request."), {
      meta: { response },
    })
  }
  return response
}

function trpcHttpStatus(error: unknown): number | null {
  const data =
    error && typeof error === "object" && "data" in error ? error.data : null
  if (
    data &&
    typeof data === "object" &&
    "httpStatus" in data &&
    typeof data.httpStatus === "number"
  )
    return data.httpStatus

  // A firewall, proxy or gateway may respond without a tRPC error body.
  const meta =
    error && typeof error === "object" && "meta" in error ? error.meta : null
  return meta &&
    typeof meta === "object" &&
    "response" in meta &&
    meta.response instanceof Response
    ? meta.response.status
    : null
}

/**
 * Client errors (4xx, except a 408 timeout) fail at once: retrying cannot
 * change the answer, and retries pause while the tab is hidden, which left
 * hydrated pages on their skeletons. Server renders keep TanStack's default
 * of no retries.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
  { isServer = typeof window === "undefined" }: { isServer?: boolean } = {},
) {
  if (isServer || failureCount >= MAX_QUERY_RETRIES) return false
  if (
    error instanceof Error &&
    (error.name === "AbortError" ||
      (error.cause instanceof Error && error.cause.name === "AbortError"))
  )
    return false
  const status = trpcHttpStatus(error)
  return status === null || !isTerminalStatus(status)
}
