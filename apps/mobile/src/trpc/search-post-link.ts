import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { httpLink } from "@trpc/client"

type SearchLinkOptions = Omit<
  Parameters<typeof httpLink<AppRouter>>[0],
  "methodOverride"
>

/** Keep entered search text in the request body, away from access-log URLs. */
export function searchPostLink(options: SearchLinkOptions) {
  return httpLink<AppRouter>({ ...options, methodOverride: "POST" })
}
