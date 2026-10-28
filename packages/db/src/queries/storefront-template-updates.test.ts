import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  claimTemplateUpdateEmail,
  enqueueTemplateUpdatePage,
  listTemplateUpdateEmails,
  readTemplateUpdateRecipient,
  setTemplateUpdateEmailPreference,
  startTemplateUpdateEmail,
} from "./storefront-template-updates"

// Offline Prisma boundary doubles; no connection, fixture or provider call.
const client = (value: unknown) => value as PrismaClient
const update = {
  key: "commerce-studio",
  version: "1.2.0",
  fromVersions: ["1.0.0", "1.1.0"],
}
const input = {
  tenantId: "business-1",
  membershipId: "member-1",
  siteId: "site-1",
  update,
}
test("recipient read binds current verified manager, LIVE business, active Store and exact older published release", async () => {
  const seen: unknown[] = []
  const db = client({
    membership: {
      findFirst: async (query: unknown) => {
        seen.push(query)
        return {
          id: "member-1",
          role: "OWNER",
          user: { email: "owner@example.test" },
          tenant: { name: "Business" },
        }
      },
    },
    site: {
      findFirst: async (query: unknown) => {
        seen.push(query)
        return {
          id: "site-1",
          storeId: "store-1",
          activeRelease: { templateVersion: "1.1.0", storeId: "store-1" },
        }
      },
    },
    businessNotificationPolicy: { findUnique: async () => null },
    businessNotificationSubscription: { findUnique: async () => null },
    businessNotificationPreference: { findUnique: async () => null },
  })
  expect(await readTemplateUpdateRecipient(db, input)).toMatchObject({
    recipient: "owner@example.test",
    businessName: "Business",
  })
  expect(seen[0]).toMatchObject({
    where: {
      id: "member-1",
      tenantId: "business-1",
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
      user: { emailVerified: true },
      tenant: { isActive: true, dataClassification: "LIVE" },
    },
  })
  expect(seen[1]).toMatchObject({
    where: {
      tenantId: "business-1",
      id: "site-1",
      isPrimary: true,
      status: "PUBLISHED",
      store: { tenantId: "business-1", status: "ACTIVE" },
      activeRelease: {
        tenantId: "business-1",
        siteId: "site-1",
        templateKey: "commerce-studio",
        templateVersion: { in: ["1.0.0", "1.1.0"] },
      },
    },
  })
})
test("revoked/foreign membership or mismatched release Store fail before delivery", async () => {
  const missing = client({ membership: { findFirst: async () => null } })
  expect(await readTemplateUpdateRecipient(missing, input)).toBeNull()
  const foreign = client({
    membership: {
      findFirst: async () => ({
        id: "member-1",
        role: "OWNER",
        user: { email: "owner@example.test" },
        tenant: { name: "Business" },
      }),
    },
    site: {
      findFirst: async () => ({
        id: "site-1",
        storeId: "store-1",
        activeRelease: { templateVersion: "1.1.0", storeId: "foreign-store" },
      }),
    },
  })
  expect(await readTemplateUpdateRecipient(foreign, input)).toBeNull()
})
test("claim is a scoped conditional write, including pre-provider NULL failure leases", async () => {
  const calls: Prisma.BusinessActivityOutboxUpdateManyArgs[] = []
  const now = new Date("2026-10-28T01:00:00Z")
  const db = client({
    businessActivityOutbox: {
      updateMany: async (
        query: Prisma.BusinessActivityOutboxUpdateManyArgs,
      ) => {
        calls.push(query)
        return { count: calls.length === 1 ? 1 : 0 }
      },
    },
  })
  const owned = await claimTemplateUpdateEmail(
    db,
    "outbox-1",
    "business-1",
    now,
  )
  expect(owned).toMatchObject({
    id: "outbox-1",
    tenantId: "business-1",
    status: "CLAIMED",
  })
  expect(calls[0]?.where).toMatchObject({
    id: "outbox-1",
    tenantId: "business-1",
    consumer: "storefront_template_update_email",
    attemptCount: { lt: 3 },
  })
  expect(calls[0]?.where?.OR).toContainEqual({
    status: "CLAIMED",
    claimExpiresAt: { lte: now },
    OR: [{ failureCode: null }, { failureCode: { not: "DISPATCH_STARTED" } }],
  })
  expect(calls[0]?.data).toMatchObject({
    attemptCount: { increment: 1 },
    claimExpiresAt: new Date("2026-10-28T01:05:00Z"),
  })
  expect(
    await claimTemplateUpdateEmail(db, "outbox-1", "business-1", now),
  ).toBeNull()
})
test("expired provider-bound attempts become terminal unknown before due selection", async () => {
  const writes: Prisma.BusinessActivityOutboxUpdateManyArgs[] = []
  let read = false
  const db = client({
    businessActivityOutbox: {
      updateMany: async (
        query: Prisma.BusinessActivityOutboxUpdateManyArgs,
      ) => {
        expect(read).toBe(false)
        writes.push(query)
        return { count: 1 }
      },
      findMany: async (query: Prisma.BusinessActivityOutboxFindManyArgs) => {
        read = true
        expect(query.take).toBe(25)
        return []
      },
    },
  })
  await listTemplateUpdateEmails(db)
  expect(writes[0]?.where).toMatchObject({
    consumer: "storefront_template_update_email",
    status: "CLAIMED",
    failureCode: "DISPATCH_STARTED",
  })
  expect(writes[0]?.data).toMatchObject({
    status: "FAILED",
    failureCode: "EMAIL_OUTCOME_UNKNOWN",
    claimId: null,
  })
  expect(writes[1]?.where).toMatchObject({ attemptCount: { gte: 3 } })
})

test("dispatch start rechecks revoked access under locks and rejects a foreign claim", async () => {
  const locks: string[] = []
  let writes = 0
  let transactions = 0
  const tx = {
    $executeRaw: async () => {
      locks.push("policy")
      return 0
    },
    $queryRaw: async () => {
      locks.push("scope")
      return []
    },
    membership: { findFirst: async () => null },
    businessActivityOutbox: {
      updateMany: async () => {
        writes++
        return { count: 1 }
      },
    },
  }
  const db = client({
    $transaction: async (run: (value: typeof tx) => Promise<unknown>) => {
      transactions++
      return run(tx)
    },
  })
  const claim = {
    id: "outbox-1",
    tenantId: "business-1",
    consumer: "storefront_template_update_email",
    status: "CLAIMED" as const,
    claimId: randomUUID(),
  }
  expect(
    await startTemplateUpdateEmail(db, claim, {
      ...input,
      tenantId: "foreign-business",
      recipient: "owner@example.test",
    }),
  ).toBe(false)
  expect(transactions).toBe(0)
  expect(
    await startTemplateUpdateEmail(db, claim, {
      ...input,
      recipient: "owner@example.test",
    }),
  ).toBe(false)
  expect(locks).toEqual(["policy", "scope"])
  expect(writes).toBe(0)
})
test("personal preference rechecks business membership under lock and touches only that member's email setting", async () => {
  const writes: unknown[] = []
  let member: { id: string } | null = null
  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async () => [],
    membership: {
      findFirst: async (query: unknown) => {
        expect(query).toMatchObject({
          where: {
            tenantId: "business-1",
            userId: "user-1",
            status: "ACTIVE",
            role: { in: ["OWNER", "ADMIN"] },
          },
        })
        return member
      },
    },
    businessNotificationPreference: {
      upsert: async (query: unknown) => {
        writes.push(query)
        return {}
      },
    },
  }
  const db = client({
    $transaction: async (run: (value: typeof tx) => Promise<unknown>) =>
      run(tx),
  })
  await expect(
    setTemplateUpdateEmailPreference(db, {
      tenantId: "business-1",
      userId: "user-1",
      enabled: false,
    }),
  ).rejects.toThrow("Current business management access")
  expect(writes).toHaveLength(0)
  member = { id: "member-1" }
  await setTemplateUpdateEmailPreference(db, {
    tenantId: "business-1",
    userId: "user-1",
    enabled: false,
  })
  expect(writes[0]).toMatchObject({
    where: {
      tenantId_membershipId_type: {
        tenantId: "business-1",
        membershipId: "member-1",
        type: "settings.storefront_template_update",
      },
    },
    update: { email: "off" },
  })
})

test("discovery replays do not enqueue another email or change first-observation facts", async () => {
  let checked = false
  const tx = {
    $executeRaw: async () => 0,
    businessActivityEvent: {
      findFirst: async () => {
        checked = true
        return { id: "existing-event" }
      },
    },
  }
  const db = client({
    $queryRaw: async () => [
      {
        tenantId: "business-1",
        membershipId: "member-1",
        siteId: "site-1",
        storeId: "store-1",
        fromVersion: "1.1.0",
      },
    ],
    $transaction: async (run: (value: typeof tx) => Promise<unknown>) =>
      run(tx),
  })
  expect(await enqueueTemplateUpdatePage(db, update)).toBe(1)
  expect(checked).toBe(true)
})
