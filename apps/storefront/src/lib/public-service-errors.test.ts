import { expect, test } from "bun:test"
import {
  CatalogError,
  CustomerChannelsError,
  ServiceCommercePolicyError,
} from "@ewatrade/db/queries"
import { isPublicServiceUnavailable } from "./public-service-errors"

test("a policy-blocked public token is unavailable, rather than a server failure", () => {
  expect(
    isPublicServiceUnavailable(
      new ServiceCommercePolicyError("POLICY_BLOCKED", "Unavailable"),
    ),
  ).toBe(true)
})

test("invalid tokens stay unavailable and infrastructure failures remain visible", () => {
  expect(
    isPublicServiceUnavailable(
      new CustomerChannelsError("NOT_FOUND", "Entry revoked"),
    ),
  ).toBe(true)
  expect(
    isPublicServiceUnavailable(
      new CatalogError("PUBLIC_TOKEN_INVALID", "Invalid"),
    ),
  ).toBe(true)
  expect(isPublicServiceUnavailable(new Error("Database unavailable"))).toBe(
    false,
  )
  expect(
    isPublicServiceUnavailable({ name: "ServiceCommercePolicyError" }),
  ).toBe(false)
})
