/** Outcome presentation/observation never authorizes a write or changes identity. */
export type OperationFailure = "definitive" | "refresh_required" | "unknown"

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function record(value: unknown) {
  return isRecord(value) ? value : undefined
}

/**
 * Only structured server rejections establish a failed attempt. A lost response
 * remains uncertain even if a later retry is denied before idempotency lookup.
 * Call only for mutation failures; refresh failures after success stay recorded.
 */
export function classifyOperationFailure(
  error: unknown,
  options: { previousOutcomeUnknown?: boolean } = {},
): OperationFailure {
  if (options.previousOutcomeUnknown) return "unknown"
  const failure = record(error)
  const data = record(failure?.data) ?? record(record(failure?.shape)?.data)
  if (!data) return "unknown"
  const publicCode = record(data.appError)?.code
  if (
    publicCode === "IDEMPOTENCY_CONFLICT" ||
    (typeof data.httpStatus === "number" && data.httpStatus >= 500)
  )
    return "unknown"

  switch (data.code) {
    case "CONFLICT":
    case "PRECONDITION_FAILED":
      // The public API groups revision, configuration and availability errors.
      // Do not infer a revision subtype from translated or arbitrary messages.
      return "refresh_required"
    case "BAD_REQUEST":
    case "UNPROCESSABLE_CONTENT":
    case "UNAUTHORIZED":
    case "FORBIDDEN":
    case "NOT_FOUND":
      return "definitive"
    default:
      return "unknown"
  }
}
