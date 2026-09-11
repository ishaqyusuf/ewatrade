import { expect, test } from "bun:test"

import { getDashboardApiRewrites } from "./next.config"

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
