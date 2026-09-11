import { describe, expect, test } from "bun:test"

import { formatStoreConversationDate } from "./columns"

describe("Store Conversation table formatting", () => {
  test("uses the tenant timezone consistently across server and client", () => {
    const occurredAt = new Date("2026-08-13T10:40:00.000Z")

    expect(formatStoreConversationDate(occurredAt, "Africa/Lagos")).toContain(
      "11:40",
    )
    expect(formatStoreConversationDate(occurredAt, "UTC")).toContain("10:40")
  })
})
