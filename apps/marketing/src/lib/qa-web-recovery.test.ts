import { describe, expect, test } from "bun:test"
import {
  statusForQaWebCapability,
  statusForQaWebRevalidation,
} from "./qa-web-recovery"

describe("QA website recovery state", () => {
  test.each([
    [null, "network_unavailable"],
    [{ available: false }, "unavailable"],
    [{ available: false, category: "misconfigured" }, "unavailable"],
    [{ available: false, category: "upgrade_required" }, "upgrade_required"],
    [{ available: true }, "revalidate"],
  ] as const)("classifies capability %p", (capability, expected) => {
    expect(statusForQaWebCapability(capability)).toBe(expected)
  })

  test.each([
    [null, "network_unavailable"],
    [200, "authorized"],
    [401, "needs_authorization"],
    [412, "upgrade_required"],
    [426, "upgrade_required"],
    [500, "unavailable"],
  ] as const)("classifies revalidation status %p", (status, expected) => {
    expect(statusForQaWebRevalidation(status)).toBe(expected)
  })
})
