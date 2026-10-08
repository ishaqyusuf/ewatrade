/** TanStack Query's own default on the client. */
const MAX_QUERY_RETRIES = 3

function trpcHttpStatus(error: unknown): number | null {
  const data =
    error && typeof error === "object" && "data" in error ? error.data : null
  return data &&
    typeof data === "object" &&
    "httpStatus" in data &&
    typeof data.httpStatus === "number"
    ? data.httpStatus
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
  if (isServer) return false
  const status = trpcHttpStatus(error)
  if (status !== null && status >= 400 && status < 500 && status !== 408)
    return false
  return failureCount < MAX_QUERY_RETRIES
}
