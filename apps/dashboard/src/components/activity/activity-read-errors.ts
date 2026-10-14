import { TRPCClientError } from "@trpc/client"

const DRIFT_CODES = new Set(["FORBIDDEN", "UNAUTHORIZED", "BAD_REQUEST"])

/**
 * True when a read was refused because access or the cursor's bound scope
 * changed (or the membership ended). Results read earlier under the old access
 * must then be discarded and the list restarted from a fresh first page.
 * Network and server failures are not drift; earlier pages may stay.
 */
export function isAccessDrift(error: unknown) {
  if (!(error instanceof TRPCClientError)) return false
  const code = (error.data as { code?: unknown } | undefined)?.code
  return typeof code === "string" && DRIFT_CODES.has(code)
}
