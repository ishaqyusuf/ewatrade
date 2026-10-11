import { expect, test } from "bun:test"
import { generalAssistantAvailability } from "./general-availability"
test("General runtime needs a sufficiently long approval signing key", () => {
  expect(generalAssistantAvailability({})).toEqual({
    enabled: false,
    reason: "signing_unavailable",
  })
  expect(
    generalAssistantAvailability({ ASSISTANT_APPROVAL_SIGNING_KEY: "short" })
      .enabled,
  ).toBe(false)
  expect(
    generalAssistantAvailability({
      ASSISTANT_APPROVAL_SIGNING_KEY: "s".repeat(48),
    }),
  ).toEqual({ enabled: true, reason: "available" })
})
