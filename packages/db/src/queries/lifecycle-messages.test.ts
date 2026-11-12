import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  claimLifecycleMessage,
  getActiveInAppNudge,
  insertLifecycleMessageIfAbsent,
  listPendingLifecycleMessages,
  markLifecycleMessageClicked,
  markLifecycleMessageSent,
  readLifecycleHistory,
  releaseLifecycleMessage,
  setMarketingPreference,
} from "./lifecycle-messages"

// Offline Prisma boundary doubles; no connection.
const client = (value: unknown) => value as PrismaClient
const now = new Date("2026-11-12T10:00:00Z")

test("insert-if-absent skips duplicates and reports whether it created the row", async () => {
  const calls: unknown[] = []
  let rows: unknown[] = [{ id: "m1", status: "pending" }]
  const db = client({
    lifecycleMessage: {
      createManyAndReturn: async (query: unknown) => {
        calls.push(query)
        return rows
      },
    },
  })
  const input = {
    tenantId: "t1",
    userId: "u1",
    playId: "P04_site_setup",
    periodKey: "once",
    variant: "a",
    channel: "email" as const,
    status: "pending" as const,
    now,
  }
  expect(await insertLifecycleMessageIfAbsent(db, input)).toEqual({
    created: true,
    id: "m1",
    status: "pending",
  })
  rows = []
  expect(await insertLifecycleMessageIfAbsent(db, input)).toEqual({
    created: false,
  })
  expect(calls[0]).toMatchObject({
    skipDuplicates: true,
    data: [{ tenantId: "t1", userId: "u1", sentAt: null, createdAt: now }],
  })
})

test("in-app rows are visible (sentAt set) as soon as they are inserted", async () => {
  let seen: { data: Array<{ sentAt: Date | null }> } | undefined
  const db = client({
    lifecycleMessage: {
      createManyAndReturn: async (query: typeof seen) => {
        seen = query
        return [{ id: "m2", status: "sent" }]
      },
    },
  })
  await insertLifecycleMessageIfAbsent(db, {
    tenantId: "t1",
    userId: "u1",
    playId: "P06_money_accounts",
    periodKey: "2026-11",
    variant: "a",
    channel: "in_app",
    status: "sent",
    now,
  })
  expect(seen?.data[0]?.sentAt).toEqual(now)
})

test("claim fence: only a pending email row under the attempt limit is claimed, and sent is fenced on claimedAt", async () => {
  const updates: Array<{ where: unknown; data: unknown }> = []
  let count = 1
  const db = client({
    lifecycleMessage: {
      updateMany: async (query: { where: unknown; data: unknown }) => {
        updates.push(query)
        return { count }
      },
    },
  })
  const claim = await claimLifecycleMessage(db, "m1", now)
  expect(claim).toEqual({ id: "m1", claimedAt: now })
  expect(updates[0]).toMatchObject({
    where: {
      id: "m1",
      channel: "email",
      status: "pending",
      attempts: { lt: 3 },
    },
    data: { status: "sending", claimedAt: now },
  })
  expect(
    await markLifecycleMessageSent(db, claim ?? { id: "", claimedAt: now }, {
      providerMessageId: "re_1",
      now,
    }),
  ).toBe(true)
  expect(updates[1]).toMatchObject({
    where: { id: "m1", status: "sending", claimedAt: now },
    data: { status: "sent", providerMessageId: "re_1", sentAt: now },
  })
  count = 0
  expect(await claimLifecycleMessage(db, "m1", now)).toBeNull()
})

test("release returns a row to pending, or fails it once attempts are used up", async () => {
  const updates: Array<{ data: unknown }> = []
  let attempts = 1
  const db = client({
    lifecycleMessage: {
      findUnique: async () => ({ attempts }),
      updateMany: async (query: { data: unknown }) => {
        updates.push(query)
        return { count: 1 }
      },
    },
  })
  const claim = { id: "m1", claimedAt: now }
  await releaseLifecycleMessage(db, claim)
  attempts = 3
  await releaseLifecycleMessage(db, claim)
  expect(updates[0]?.data).toMatchObject({ status: "pending" })
  expect(updates[1]?.data).toMatchObject({ status: "failed" })
})

test("sweep listing settles expired claims as outcome unknown and skips rows under 2 minutes old", async () => {
  const updates: Array<{ where: unknown; data: unknown }> = []
  let listQuery: { where: { createdAt: { lte: Date } } } | undefined
  const db = client({
    lifecycleMessage: {
      updateMany: async (query: { where: unknown; data: unknown }) => {
        updates.push(query)
        return { count: 0 }
      },
      findMany: async (query: typeof listQuery) => {
        listQuery = query
        return []
      },
    },
  })
  await listPendingLifecycleMessages(db, { now })
  expect(updates[0]).toMatchObject({
    where: { status: "sending" },
    data: { status: "failed", suppressedReason: "outcome_unknown" },
  })
  expect(listQuery?.where.createdAt.lte).toEqual(
    new Date(now.getTime() - 120_000),
  )
})

test("click records first click only, implies delivery, and returns the play for UTM", async () => {
  const updates: Array<{ data: Record<string, unknown> }> = []
  let clickedAt: Date | null = null
  const db = client({
    lifecycleMessage: {
      findUnique: async () => ({
        id: "m1",
        playId: "P04_site_setup",
        clickedAt,
        deliveredAt: null,
        openedAt: null,
        channel: "email",
      }),
      updateMany: async (query: { data: Record<string, unknown> }) => {
        updates.push(query)
        return { count: 1 }
      },
    },
  })
  expect(await markLifecycleMessageClicked(db, "m1", now)).toEqual({
    id: "m1",
    playId: "P04_site_setup",
  })
  expect(updates[0]?.data).toEqual({
    clickedAt: now,
    deliveredAt: now,
    openedAt: now,
  })
  clickedAt = now
  await markLifecycleMessageClicked(db, "m1", now)
  expect(updates).toHaveLength(1)
})

test("active nudge read is scoped to the recipient and hides dismissed, converted and stale rows", async () => {
  let query: { where: Record<string, unknown> } | undefined
  const db = client({
    lifecycleMessage: {
      findFirst: async (value: typeof query) => {
        query = value
        return null
      },
    },
  })
  await getActiveInAppNudge(db, "t1", "u1", now)
  expect(query?.where).toMatchObject({
    tenantId: "t1",
    userId: "u1",
    channel: "in_app",
    status: "sent",
    dismissedAt: null,
    convertedAt: null,
  })
})

test("history counts pending email against the cap and flags a visible nudge", async () => {
  const db = client({
    lifecycleMessage: {
      findMany: async () => [
        { userId: "u1", channel: "email", sentAt: null, createdAt: now },
        { userId: "u1", channel: "in_app", sentAt: now, createdAt: now },
      ],
    },
  })
  const history = await readLifecycleHistory(db, ["u1", "u2"], now)
  expect(history.get("u1")).toEqual({ emailSentAt: [now], inAppVisible: true })
  expect(history.get("u2")).toEqual({ emailSentAt: [], inAppVisible: false })
})

test("preferences: unsubscribe-all sets the timestamp, re-enabling a category clears it", async () => {
  const seen: Array<{ update: Record<string, unknown> }> = []
  const db = client({
    marketingPreference: {
      upsert: async (query: { update: Record<string, unknown> }) => {
        seen.push(query)
        return {}
      },
    },
  })
  await setMarketingPreference(db, "u1", { unsubscribeAll: true, now })
  await setMarketingPreference(db, "u1", { offers: true })
  await setMarketingPreference(db, "u1", { offers: false })
  expect(seen[0]?.update).toEqual({ unsubscribedAllAt: now })
  expect(seen[1]?.update).toEqual({ offers: true, unsubscribedAllAt: null })
  expect(seen[2]?.update).toEqual({ offers: false })
})
