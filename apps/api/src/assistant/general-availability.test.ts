import { expect, test } from "bun:test"
import { generalAssistantAvailability } from "./general-availability"
test("General runtime needs an explicit flag and a sufficiently long approval signing key", () => {
  expect(generalAssistantAvailability({}).enabled).toBe(false)
  expect(
    generalAssistantAvailability({ ASSISTANT_GENERAL_ENABLED: "true" }),
  ).toEqual({
    flagEnabled: true,
    enabled: false,
    reason: "signing_unavailable",
  })
  expect(
    generalAssistantAvailability({
      ASSISTANT_GENERAL_ENABLED: "true",
      ASSISTANT_APPROVAL_SIGNING_KEY: "short",
    }).enabled,
  ).toBe(false)
  expect(
    generalAssistantAvailability({
      ASSISTANT_GENERAL_ENABLED: "true",
      ASSISTANT_APPROVAL_SIGNING_KEY: "s".repeat(48),
    }).enabled,
  ).toBe(true)
  expect(
    generalAssistantAvailability({
      ASSISTANT_APPROVAL_SIGNING_KEY: "s".repeat(48),
    }).enabled,
  ).toBe(false)
})
