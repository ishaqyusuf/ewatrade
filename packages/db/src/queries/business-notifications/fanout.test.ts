import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { claimBusinessNotificationFanout } from "./fanout"
import { activeBusinessNotificationTypes, notificationCatalog } from "./state"

test("unreleased fanout never connects, consumes an outbox marker or advertises a supported channel", async () => {
  let calls = 0
  const db = {
    $transaction: async () => {
      calls++
      throw Error("Unexpected connection")
    },
  } as unknown as PrismaClient
  expect(activeBusinessNotificationTypes).toHaveLength(0)
  expect(await claimBusinessNotificationFanout(db)).toEqual([])
  expect(calls).toBe(0)
  expect(
    notificationCatalog().some(
      (entry) => entry.supports.inApp || entry.supports.email,
    ),
  ).toBe(false)
  await expect(
    claimBusinessNotificationFanout(db, { limit: 100 }),
  ).rejects.toThrow()
  expect(calls).toBe(0)
})
