import {
  classifySessionError,
  isSessionExpiryOperation,
  notifySessionExpired,
} from "@/lib/session-expiry"
import { getSession, isLocalSessionToken } from "@/lib/session-store"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import type { TRPCLink } from "@trpc/client"
import { observable } from "@trpc/server/observable"

/** Signs out when a protected read is rejected for the token it was sent with. */
export function sessionExpiryLink(): TRPCLink<AppRouter> {
  return () =>
    ({ op, next }) =>
      observable((observer) => {
        const token = getSession()?.token ?? null
        return next(op).subscribe({
          next: (value) => observer.next(value),
          complete: () => observer.complete(),
          error: (error) => {
            if (
              token &&
              !isLocalSessionToken(token) &&
              isSessionExpiryOperation(op) &&
              classifySessionError(error) === "unauthorized" &&
              getSession()?.token === token
            )
              notifySessionExpired(token)
            observer.error(error)
          },
        })
      })
}
