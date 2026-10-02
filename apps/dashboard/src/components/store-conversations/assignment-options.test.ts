import { describe, expect, test } from "bun:test"

import { getStoreConversationAssignmentOptions } from "./assignment-options"

describe("store conversation assignment options", () => {
  test("returns an array for every permission combination", () => {
    expect(
      getStoreConversationAssignmentOptions({
        canRelease: false,
        canReassign: false,
      }),
    ).toEqual([])
    expect(
      getStoreConversationAssignmentOptions({
        canRelease: true,
        canReassign: false,
      }),
    ).toEqual([
      { value: "handoff", label: "Hand off" },
      { value: "release", label: "Return to queue" },
    ])
    expect(
      getStoreConversationAssignmentOptions({
        canRelease: false,
        canReassign: true,
      }),
    ).toEqual([{ value: "reassign", label: "Reassign" }])
    expect(
      getStoreConversationAssignmentOptions({
        canRelease: true,
        canReassign: true,
      }),
    ).toEqual([
      { value: "handoff", label: "Hand off" },
      { value: "release", label: "Return to queue" },
      { value: "reassign", label: "Reassign" },
    ])
  })
})
