import { describe, expect, test } from "bun:test"

import {
  StoreConversationServicePreferenceError,
  resolveStoreConversationPreferredTime,
} from "./store-conversation-service-intake"
import type { DbClient } from "./types"

const now = new Date("2026-11-16T08:00:00.000Z")

function tenantDb(timezone = "Africa/Lagos") {
  const reads: unknown[] = []
  const db = {
    tenant: {
      findUniqueOrThrow: async (args: unknown) => {
        reads.push(args)
        return { timezone }
      },
    },
  } as unknown as DbClient
  return { db, reads }
}

describe("Store chat service request preferred time", () => {
  test("is optional and reads nothing when both fields are empty", async () => {
    const { db, reads } = tenantDb()
    expect(
      await resolveStoreConversationPreferredTime(
        db,
        { tenantId: "tenant_1" },
        now,
      ),
    ).toBeUndefined()
    expect(reads).toEqual([])
  })

  test("reads the day and time in the business's time zone", async () => {
    const { db } = tenantDb("Africa/Lagos")
    const at = await resolveStoreConversationPreferredTime(
      db,
      { preferredDate: "2026-11-18", preferredTime: "10:30", tenantId: "t" },
      now,
    )
    expect(at?.toISOString()).toBe("2026-11-18T09:30:00.000Z")
  })

  test("refuses a day without a time, or a time without a day", async () => {
    for (const input of [
      { preferredDate: "2026-11-18" },
      { preferredTime: "10:30" },
    ]) {
      await expect(
        resolveStoreConversationPreferredTime(
          tenantDb().db,
          { ...input, tenantId: "t" },
          now,
        ),
      ).rejects.toBeInstanceOf(StoreConversationServicePreferenceError)
    }
  })

  test("refuses a past time and one beyond six months", async () => {
    for (const preferredDate of ["2026-11-15", "2027-06-30"]) {
      await expect(
        resolveStoreConversationPreferredTime(
          tenantDb().db,
          { preferredDate, preferredTime: "10:00", tenantId: "t" },
          now,
        ),
      ).rejects.toBeInstanceOf(StoreConversationServicePreferenceError)
    }
  })
})
