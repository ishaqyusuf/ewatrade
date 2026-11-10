import { expect, test } from "bun:test"

import nextConfig, { getDashboardApiRewrites } from "./next.config"

test("proxies finance receipt upload, grant and private original transport to the configured API", () => {
  const rewrites = getDashboardApiRewrites("https://api.example.test")
  expect(rewrites).toContainEqual({
    source: "/api/finance/expense-receipts/:path*",
    destination: "https://api.example.test/api/finance/expense-receipts/:path*",
  })
  expect(
    rewrites.filter((rule) => rule.source.startsWith("/api/finance/")),
  ).toHaveLength(1)
  expect(rewrites).not.toContainEqual({
    source: "/api/:path*",
    destination: "https://api.example.test/api/:path*",
  })
})

test("proxies both generic and clinical one-time attachment grants to the API", () => {
  expect(getDashboardApiRewrites("https://api.example.test")).toContainEqual({
    source: "/api/service-commerce/media/:path*",
    destination: "https://api.example.test/api/service-commerce/media/:path*",
  })
  expect(getDashboardApiRewrites("https://api.example.test")).toContainEqual({
    source: "/api/prescriptions/media/:path*",
    destination: "https://api.example.test/api/prescriptions/media/:path*",
  })
})

test("proxies catalog private photo transport through the existing authenticated API", () => {
  expect(getDashboardApiRewrites("https://api.example.test")).toContainEqual({
    source: "/api/catalog/photos/:path*",
    destination: "https://api.example.test/api/catalog/photos/:path*",
  })
})

test("proxies manual payment receipts to the API for same-origin review", () => {
  expect(getDashboardApiRewrites("https://api.example.test")).toContainEqual({
    source: "/api/manual-payments/:path*",
    destination: "https://api.example.test/api/manual-payments/:path*",
  })
})

test("proxies the streaming setup assistant chat to the API", () => {
  expect(getDashboardApiRewrites("https://api.example.test")).toContainEqual({
    source: "/api/assistant/:path*",
    destination: "https://api.example.test/api/assistant/:path*",
  })
})

test("payment links and payment login returns are omitted from application request logs", () => {
  const ignored = nextConfig.logging.incomingRequests.ignore
  const hidden = (path: string) => ignored.some((pattern) => pattern.test(path))
  for (const path of [
    "/p/AbCdEfGhIjKlMnOpQr_-12",
    "/pay/private.signed-token",
    "/login?next=%2Fp%2FAbCdEfGhIjKlMnOpQr_-12",
    "/login?error=expired&next=%2Fpay%2Fprivate-token",
  ])
    expect(hidden(path)).toBe(true)
  expect(hidden("/inventory")).toBe(false)
  expect(hidden("/login?next=%2Finventory")).toBe(false)
})

test("saved response navigation keeps private headers and omits locators from request logs", async () => {
  const hidden = (path: string) =>
    nextConfig.logging.incomingRequests.ignore.some((pattern) =>
      pattern.test(path),
    )
  for (const path of [
    "/open/assistant-response/saved_message",
    "/assistant/c/chat?messageId=saved_message",
    "/login?next=%2Fopen%2Fassistant-response%2Fsaved_message",
  ])
    expect(hidden(path)).toBe(true)
  const headers = await nextConfig.headers()
  expect(headers).toContainEqual({
    source: "/open/assistant-response/:messageId",
    headers: expect.arrayContaining([
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ]),
  })
  expect(nextConfig.transpilePackages).toContain("@ewatrade/assistant")
})
