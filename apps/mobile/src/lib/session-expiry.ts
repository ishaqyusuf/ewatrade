export const SESSION_ENDED_NOTICE = "session-ended"

export type SessionErrorKind = "unauthorized" | "other"

/**
 * UNAUTHORIZED means the server rejected the stored session token, so a retry
 * can never succeed. Network failures and server errors carry no tRPC code (or
 * a different one) and stay on the screen's own retry path.
 */
export function classifySessionError(error: unknown): SessionErrorKind {
  if (!error || typeof error !== "object" || !("data" in error)) return "other"
  const data = error.data
  if (!data || typeof data !== "object") return "other"
  if ("code" in data && data.code === "UNAUTHORIZED") return "unauthorized"
  if ("httpStatus" in data && data.httpStatus === 401) return "unauthorized"
  return "other"
}

/** Protected reads only: auth.* calls report bad credentials, not a dead session. */
export function isSessionExpiryOperation(op: { path: string; type: string }) {
  return op.type === "query" && !op.path.startsWith("auth.")
}

type SessionExpiredListener = (token: string) => void

const listeners = new Set<SessionExpiredListener>()
let lastExpiredToken: string | null = null

export function subscribeSessionExpired(listener: SessionExpiredListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Fires once per token, however many parallel reads fail with it. */
export function notifySessionExpired(token: string | null | undefined) {
  if (!token || token === lastExpiredToken) return
  lastExpiredToken = token
  for (const listener of listeners) listener(token)
}
