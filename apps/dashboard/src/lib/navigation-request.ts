/** Middleware stamps this before Next hides its internal Flight headers. */
export const DASHBOARD_REQUEST_KIND_HEADER = "x-ewatrade-request-kind"

export function dashboardRequestKind(
  request: Pick<Request, "method" | "headers">,
) {
  return request.method === "GET" && request.headers.get("rsc") !== "1"
    ? "document"
    : "navigation"
}
