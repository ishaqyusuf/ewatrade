import { describe, expect, test } from "bun:test"

import { resolvePayloadBoundOperation } from "./payload-bound-operation"

describe("payload-bound dashboard operations", () => {
  test("reuses an identity only for the same payload", () => {
    const ids = ["operation-1", "operation-2"]
    const createId = () => ids.shift() ?? "operation-extra"
    const first = resolvePayloadBoundOperation(null, "payload-a", createId)

    expect(resolvePayloadBoundOperation(first, "payload-a", createId)).toBe(
      first,
    )
    expect(resolvePayloadBoundOperation(first, "payload-b", createId)).toEqual({
      id: "operation-2",
      key: "payload-b",
    })
  })
})
