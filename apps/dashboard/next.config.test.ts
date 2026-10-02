import { expect, test } from "bun:test"

import { getDashboardApiRewrites } from "./next.config"

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
