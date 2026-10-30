/** Middleware stamps this; route headers() never sees Next's Flight headers. */
export const DASHBOARD_REQUEST_KIND_HEADER = "x-ewatrade-request-kind"

/**
 * Next16's middleware adapter deletes its Flight headers (`rsc`, router
 * prefetch) before userland middleware runs, so their absence proves nothing.
 * Only browser Fetch Metadata positively marks a top-level document load.
 * Raw Flight, speculative prefetch and every unproven request schedule as
 * navigation. This selects read scheduling only, never authority.
 */
export function dashboardRequestKind(
  request: Pick<Request, "method" | "headers">,
): "document" | "navigation" {
  const { headers } = request
  const fullDocument =
    request.method === "GET" &&
    headers.get("sec-fetch-dest") === "document" &&
    headers.get("rsc") !== "1" &&
    !headers.get("sec-purpose")?.includes("prefetch")
  return fullDocument ? "document" : "navigation"
}
