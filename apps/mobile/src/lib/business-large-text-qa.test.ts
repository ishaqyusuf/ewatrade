import { describe, expect, test } from "bun:test"
import {
  parseBusinessLargeTextQaState,
  resolveBusinessLargeTextQaPath,
} from "./business-large-text-qa"

describe("Business large-text QA routing", () => {
  test("admits an exact development-only Business audit state", () => {
    expect(
      resolveBusinessLargeTextQaPath(
        "ewatrade-dev://business-large-text?qaState=b001",
        true,
      ),
    ).toBe("/design-system/business-large-text?qaState=b001&theme=light")
    expect(
      resolveBusinessLargeTextQaPath(
        "ewatrade-dev://business-large-text?qaState=b001&theme=dark",
        true,
      ),
    ).toBe("/design-system/business-large-text?qaState=b001&theme=dark")
    expect(
      parseBusinessLargeTextQaState({ development: true, qaState: "b032" }),
    ).toBe("b032")
  })

  test("rejects production, unknown, and array-valued states", () => {
    expect(
      resolveBusinessLargeTextQaPath(
        "ewatrade-dev://business-large-text?qaState=b001",
        false,
      ),
    ).toBeNull()
    expect(
      parseBusinessLargeTextQaState({ development: true, qaState: "b033" }),
    ).toBeNull()
    expect(
      parseBusinessLargeTextQaState({
        development: true,
        qaState: ["b001"],
      }),
    ).toBeNull()
  })
})
