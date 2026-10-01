import { expect, test } from "bun:test"
import { mobileAgeRequestHeaders } from "./mobile-age-request-headers"

test("age-status transport sends only session proof and mobile source", () => {
  expect(mobileAgeRequestHeaders("session-token")).toEqual({
    "x-app-authorization": "Bearer session-token",
    "x-trpc-source": "mobile",
  })
  expect(mobileAgeRequestHeaders(null)).toEqual({
    "x-trpc-source": "mobile",
  })
})
