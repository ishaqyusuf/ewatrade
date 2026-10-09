import { expect, test } from "bun:test"
import { generalAssistantAvailability } from "./general-availability"
test("general assistant remains unavailable even if its launch flag is accidentally enabled", () => {
  expect(generalAssistantAvailability({})).toEqual({
    flagEnabled: false,
    enabled: false,
    reason: "flag_off",
  })
  expect(
    generalAssistantAvailability({ ASSISTANT_GENERAL_ENABLED: "true" }),
  ).toEqual({ flagEnabled: true, enabled: false, reason: "runtime_pending" })
})
