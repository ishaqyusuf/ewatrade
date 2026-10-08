export type QaRevalidationOutcome = "valid" | "renew" | "unavailable"

/**
 * Only a server rejection of the saved token (expired or revoked) means QA
 * must be renewed. Network and server hiccups keep the saved authorization.
 */
export function classifyQaRevalidation(input: {
  errorCode?: string | null
  isError: boolean
}): QaRevalidationOutcome {
  if (!input.isError) return "valid"
  return input.errorCode === "UNAUTHORIZED" ? "renew" : "unavailable"
}

/** One short line for the QA domain field. */
export function describeQaAuthorizationError(input: {
  errorCode?: string | null
  message?: string | null
}) {
  if (input.errorCode === "TOO_MANY_REQUESTS")
    return "Too many tries. Wait a minute, then try again."
  if (input.errorCode === "UNAUTHORIZED" || input.errorCode === "BAD_REQUEST")
    return "This domain isn’t set up for QA on this server."
  if (!input.errorCode) return "Can’t reach the server. Check it is running."
  return input.message || "QA couldn’t connect. Try again."
}
