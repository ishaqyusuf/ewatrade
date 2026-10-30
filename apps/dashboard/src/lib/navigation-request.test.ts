import { expect, test } from "bun:test"
import {
  DASHBOARD_REQUEST_KIND_HEADER,
  dashboardRequestKind,
} from "./navigation-request"

type Kind = ReturnType<typeof dashboardRequestKind>

const documentLoad = {
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
}
const cases: [string, string, Record<string, string>, Kind][] = [
  ["a full browser load", "GET", documentLoad, "document"],
  [
    "a same-origin refresh",
    "GET",
    {
      ...documentLoad,
      "sec-fetch-site": "same-origin",
      "cache-control": "max-age=0",
    },
    "document",
  ],
  [
    "a soft navigation after Next strips rsc",
    "GET",
    { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" },
    "navigation",
  ],
  ["a raw Flight navigation", "GET", { rsc: "1" }, "navigation"],
  [
    "a raw Flight request claiming a document",
    "GET",
    { ...documentLoad, rsc: "1" },
    "navigation",
  ],
  [
    "a raw router prefetch",
    "GET",
    { rsc: "1", "next-router-prefetch": "1", "sec-fetch-dest": "empty" },
    "navigation",
  ],
  [
    "a speculative document prefetch",
    "GET",
    { ...documentLoad, "sec-purpose": "prefetch" },
    "navigation",
  ],
  [
    "a speculative prerender",
    "GET",
    { ...documentLoad, "sec-purpose": "prefetch;prerender" },
    "navigation",
  ],
  [
    "a framed document",
    "GET",
    { ...documentLoad, "sec-fetch-dest": "iframe" },
    "navigation",
  ],
  ["a POST", "POST", documentLoad, "navigation"],
  ["a HEAD", "HEAD", documentLoad, "navigation"],
  ["a GET without Fetch Metadata", "GET", {}, "navigation"],
  [
    "a mis-cased destination",
    "GET",
    { "sec-fetch-dest": "Document" },
    "navigation",
  ],
  [
    "a repeated destination",
    "GET",
    { "sec-fetch-dest": "document, empty" },
    "navigation",
  ],
  ["an empty destination", "GET", { "sec-fetch-dest": "" }, "navigation"],
  [
    "a forged document hint",
    "GET",
    { [DASHBOARD_REQUEST_KIND_HEADER]: "document" },
    "navigation",
  ],
  [
    "a forged navigation hint on a real document",
    "GET",
    { ...documentLoad, [DASHBOARD_REQUEST_KIND_HEADER]: "navigation" },
    "document",
  ],
]

test.each(cases)("classifies %s", (_, method, headers, expected) => {
  expect(dashboardRequestKind({ method, headers: new Headers(headers) })).toBe(
    expected,
  )
})

test("the installed Next adapter keeps Fetch Metadata visible to the actual middleware", () => {
  // A fresh process: Next binds its request storage when first loaded.
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--env-file=/dev/null",
      "test",
      "./packages/assistant/evaluations/fixtures/dashboard-next-request-kind.fixture.ts",
    ],
    {
      cwd: new URL("../../../../", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        EWATRADE_DATABASE_URL: "postgresql://inert@127.0.0.1:1/inert",
      },
      timeout: 15_000,
    },
  )
  if (result.exitCode !== 0)
    throw Error(
      new TextDecoder().decode(result.stderr) ||
        new TextDecoder().decode(result.stdout),
    )
  expect(result.exitCode).toBe(0)
}, 20_000)
