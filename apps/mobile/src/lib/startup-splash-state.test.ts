import { describe, expect, test } from "bun:test"
import { startupAccessFailureState } from "./startup-splash-state"

describe("startup access failure presentation", () => {
  test("shows connection recovery for native transport failures", () => {
    for (const message of [
      "Network request failed",
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
    ]) {
      expect(startupAccessFailureState({ message })).toBe("offline")
    }
  })

  test("does not turn server or authorization failures into an offline or no-access claim", () => {
    for (const message of [
      "Internal server error",
      "UNAUTHORIZED",
      "Access profile unavailable",
      "Request timed out",
    ]) {
      expect(startupAccessFailureState({ message })).toBe("error")
    }
  })
})
