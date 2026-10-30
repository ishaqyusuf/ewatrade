import { expect, test } from "bun:test"
import { createRequire } from "node:module"

// Installed Next's server boot installs AsyncLocalStorage before its request
// storage loads; the middleware adapter's request/work stores need it. The
// bootstrap is side-effect CJS whose .d.ts is not a module, so require it.
createRequire(import.meta.url)("next/dist/server/node-environment-baseline")
const { adapter } = await import("next/dist/server/web/adapter")
const { FLIGHT_HEADERS } = await import(
  "next/dist/client/components/app-router-headers"
)
const { NextResponse } = await import("next/server")
const { middleware } = await import("../../../../apps/dashboard/src/middleware")
const { DASHBOARD_REQUEST_KIND_HEADER, dashboardRequestKind } = await import(
  "../../../../apps/dashboard/src/lib/navigation-request"
)

type Handler = Parameters<typeof adapter>[0]["handler"]
type MiddlewareRequest = Parameters<Handler>[0]
type RequestShape = {
  method?: string
  search?: string
  headers: Record<string, string>
}

const host = "ewatrade-dashboard.localhost"
const stamped = `x-middleware-request-${DASHBOARD_REQUEST_KIND_HEADER}`
// Browser-generated headers per request kind. Page scripts cannot set Sec-
// headers; Next's client router sends its Flight headers through fetch().
const documentLoad = {
  accept: "text/html,application/xhtml+xml",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
}
const softNavigation = {
  accept: "*/*",
  rsc: "1",
  "next-router-state-tree": "%5B%22%22%2C%7B%7D%5D",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
}
const routerPrefetch = {
  ...softNavigation,
  "next-router-prefetch": "1",
  "next-router-segment-prefetch": "/_tree",
}

function throughNext(
  handler: Handler,
  {
    method = "GET",
    search = "",
    cookie = "better-auth.session_token=fixture",
    headers = {},
  }: {
    method?: string
    search?: string
    cookie?: string | null
    headers?: Record<string, string>
  } = {},
) {
  // The request shape NextNodeServer.runMiddleware hands to the adapter.
  return adapter({
    page: "/src/middleware",
    handler,
    request: {
      url: `https://${host}/finance${search}`,
      method,
      headers: { host, ...(cookie ? { cookie } : {}), ...headers },
      nextConfig: {},
      signal: new AbortController().signal,
    },
  })
}
const actualMiddleware: Handler = async (request) => middleware(request)

test("the fixture drives installed Next 16.4.3's Node middleware adapter", async () => {
  const nextPackage = await Bun.file(
    Bun.resolveSync("next/package.json", import.meta.dir),
  ).json()
  expect(nextPackage.version).toBe("16.4.3")
  // Edge page rendering or the URL-normalize opt-out would skip stripping.
  expect("__BUILD_MANIFEST" in globalThis).toBe(false)
  expect(process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE).toBeUndefined()
  expect(FLIGHT_HEADERS).toContain("rsc")
  expect(FLIGHT_HEADERS).toContain("next-router-prefetch")
  expect(FLIGHT_HEADERS).not.toContain("sec-fetch-dest")
})

test("baseline: Next strips raw rsc before middleware, so the parent rule called a soft navigation a document", async () => {
  const received: MiddlewareRequest[] = []
  const { response } = await throughNext(
    async (request) => {
      received.push(request)
      return NextResponse.next()
    },
    { search: "?_rsc=1a2b3", headers: softNavigation },
  )
  const [request] = received
  if (!request) throw Error("middleware did not run")
  expect(response.status).toBe(200)
  for (const name of FLIGHT_HEADERS)
    expect(request.headers.get(name)).toBeNull()
  expect(request.nextUrl.search).toBe("")
  expect(request.headers.get("sec-fetch-dest")).toBe("empty")
  expect(request.headers.get("sec-fetch-mode")).toBe("cors")
  // Parent 959d75210 classifier, verbatim.
  const parentKind = (input: Pick<Request, "method" | "headers">) =>
    input.method === "GET" && input.headers.get("rsc") !== "1"
      ? "document"
      : "navigation"
  expect(parentKind(request)).toBe("document")
  expect(dashboardRequestKind(request)).toBe("navigation")
})

const rows: [string, RequestShape, string][] = [
  ["a full browser load", { headers: documentLoad }, "document"],
  [
    "a browser refresh",
    {
      headers: {
        ...documentLoad,
        "sec-fetch-site": "same-origin",
        "cache-control": "max-age=0",
      },
    },
    "document",
  ],
  [
    "a soft navigation",
    { search: "?_rsc=1a2b3", headers: softNavigation },
    "navigation",
  ],
  [
    "a router prefetch",
    { search: "?_rsc=4c5d6", headers: routerPrefetch },
    "navigation",
  ],
  [
    "a speculative document prefetch",
    { headers: { ...documentLoad, "sec-purpose": "prefetch" } },
    "navigation",
  ],
  ["a GET without Fetch Metadata", { headers: {} }, "navigation"],
  [
    "a malformed destination",
    { headers: { ...documentLoad, "sec-fetch-dest": "Document" } },
    "navigation",
  ],
  ["a POST", { method: "POST", headers: documentLoad }, "navigation"],
  ["a HEAD", { method: "HEAD", headers: documentLoad }, "navigation"],
]

test.each(rows)(
  "actual middleware behind the adapter classifies %s and overwrites a forged hint",
  async (_, shape, expected) => {
    const { response } = await throughNext(actualMiddleware, {
      ...shape,
      headers: {
        ...shape.headers,
        [DASHBOARD_REQUEST_KIND_HEADER]:
          expected === "document" ? "navigation" : "document",
      },
    })
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get(stamped)).toBe(expected)
    expect(response.headers.get("x-middleware-request-x-pathname")).toBe(
      "/finance",
    )
    expect(
      response.headers.get("x-middleware-override-headers")?.split(","),
    ).toContain(DASHBOARD_REQUEST_KIND_HEADER)
    // Next re-applies its Flight headers for the render after middleware.
    expect(response.headers.get("x-middleware-request-rsc")).toBe(
      shape.headers.rsc ?? null,
    )
  },
)

test("behind the adapter, sign-in refusal still stamps no scheduling hint", async () => {
  const { response } = await throughNext(actualMiddleware, {
    cookie: null,
    headers: { ...documentLoad, [DASHBOARD_REQUEST_KIND_HEADER]: "document" },
  })
  expect(response.headers.get("location")).toContain("/login")
  expect(response.headers.get(stamped)).toBeNull()
})
