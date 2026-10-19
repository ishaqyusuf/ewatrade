import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test"
import { randomUUID } from "node:crypto"
import {
  WHATSAPP_TRANSPORT_LIMITS,
  WHATSAPP_USAGE_RETENTION_AFTER_WINDOW_MS,
} from "@ewatrade/assistant/channels/policy"
import { PrismaClient } from "@ewatrade/db"
import { PrismaPg } from "@prisma/adapter-pg"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import { runInOwnSerializableTransaction } from "../own-transaction"
import { assistantWhatsAppPrivacyInventory } from "./privacy"
import {
  expireAssistantWhatsAppUsage,
  reserveAssistantWhatsAppTransportInTransaction,
} from "./usage"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const marker = `wa-usage-${randomUUID()}`
const users = Array.from({ length: 6 }, (_, i) => `${marker}-user-${i}`)
const tenants = [`${marker}-tenant-a`, `${marker}-tenant-b`]
let db: PrismaClient
beforeAll(async () => {
  if (!enabled) return
  assertQaAccessAcceptanceDatabase()
  if (
    new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
    "/ewatrade_qa_v1"
  )
    throw Error("Explicit local QA target required")
  db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 3,
    }),
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })
  await db.$transaction(async (tx) => {
    for (const userId of users)
      await tx.user.create({
        data: { id: userId, email: `${userId}@example.test`, ageBand: "ADULT" },
      })
    for (const tenantId of tenants)
      await tx.tenant.create({
        data: {
          id: tenantId,
          slug: tenantId,
          name: "Synthetic usage business",
          type: "MERCHANT",
          dataClassification: "QA",
          qaMarkedAt: new Date(),
          qaSourceDomain: "assistant-whatsapp-usage.test",
        },
      })
  })
}, 60_000)
beforeEach(async () => {
  if (enabled)
    await db.assistantWhatsAppUsageBucket.deleteMany({
      where: { tenantId: { in: tenants }, userId: { in: users } },
    })
})
afterAll(async () => {
  if (!db) return
  try {
    await db.tenant.deleteMany({
      where: {
        id: { in: tenants },
        qaSourceDomain: "assistant-whatsapp-usage.test",
      },
    })
    expect(
      await db.assistantWhatsAppUsageBucket.count({
        where: { userId: { in: users } },
      }),
    ).toBe(0)
    await db.user.deleteMany({
      where: { id: { in: users }, email: { endsWith: "@example.test" } },
    })
  } finally {
    await db.$disconnect()
  }
}, 60_000)
function fixtureScope(user = 0, tenant = 0) {
  const userId = users[user]
  const tenantId = tenants[tenant]
  if (!userId || !tenantId) throw Error("Invalid owned fixture")
  return { userId, tenantId }
}
function window(kind: "MINUTE" | "DAY", now: Date) {
  const width = kind === "MINUTE" ? 60_000 : 86_400_000
  const start = new Date(Math.floor(now.getTime() / width) * width)
  const end = new Date(start.getTime() + width)
  return {
    windowKind: kind,
    windowStartedAt: start,
    windowEndsAt: end,
    expiresAt: new Date(
      end.getTime() + WHATSAPP_USAGE_RETENTION_AFTER_WINDOW_MS,
    ),
  }
}
const reserve = (
  scope: ReturnType<typeof fixtureScope>,
  kind: "ingress" | "deliveryAttempts",
  now: Date,
) =>
  runInOwnSerializableTransaction(db, (tx) =>
    (() => {
      const resolved = {
        ...scope,
        storeId: "ignored-store",
        membershipId: "ignored-membership",
      }
      return reserveAssistantWhatsAppTransportInTransaction(
        tx,
        resolved,
        kind,
        now,
      )
    })(),
  )
suite("WhatsApp transport usage on guarded local Neon", () => {
  test("concurrent different-Tenant requests share the actor ceiling and only new UTC windows reset it", async () => {
    const now = new Date()
    const scope = fixtureScope()
    for (const kind of ["MINUTE", "DAY"] as const)
      await db.assistantWhatsAppUsageBucket.create({
        data: {
          ...scope,
          ...window(kind, now),
          ingress: WHATSAPP_TRANSPORT_LIMITS[kind].user.ingress - 1,
        },
      })
    const outcomes = await Promise.all([
      reserve(scope, "ingress", now),
      reserve(fixtureScope(0, 1), "ingress", now),
    ])
    expect(outcomes.filter((row) => row.allowed)).toHaveLength(1)
    for (const kind of ["MINUTE", "DAY"] as const) {
      const usage = await db.assistantWhatsAppUsageBucket.aggregate({
        where: {
          userId: scope.userId,
          windowKind: kind,
          windowStartedAt: window(kind, now).windowStartedAt,
        },
        _sum: { ingress: true },
      })
      expect(usage._sum.ingress).toBe(
        WHATSAPP_TRANSPORT_LIMITS[kind].user.ingress,
      )
    }
    const nextMinute = new Date(
      window("MINUTE", now).windowEndsAt.getTime() + 1,
    )
    // Pick a guaranteed same-day next minute even at UTC midnight.
    const sameDay =
      nextMinute < window("DAY", now).windowEndsAt ? nextMinute : now
    expect((await reserve(scope, "ingress", sameDay)).allowed).toBe(false)
    expect(
      (
        await reserve(
          scope,
          "ingress",
          new Date(window("DAY", now).windowEndsAt.getTime() + 1),
        )
      ).allowed,
    ).toBe(true)
    const ids = (
      await db.assistantWhatsAppUsageBucket.findMany({
        where: { userId: scope.userId },
        select: { id: true },
      })
    ).map((row) => row.id)
    expect((await expireAssistantWhatsAppUsage(db, now, ids)).cleared).toBe(0)
    expect(
      (await assistantWhatsAppPrivacyInventory(db, scope.userId))
        .assistantWhatsAppUsageBuckets,
    ).toBeGreaterThan(0)
    expect(
      (
        await expireAssistantWhatsAppUsage(
          db,
          new Date(now.getTime() + 3 * 86_400_000),
          ids,
        )
      ).cleared,
    ).toBe(ids.length)
    expect(
      (await assistantWhatsAppPrivacyInventory(db, scope.userId))
        .assistantWhatsAppUsageBuckets,
    ).toBe(0)
  }, 120_000)
  test("Tenant totals include other staff, while another Tenant keeps its own allowance", async () => {
    const now = new Date()
    for (let user = 0; user < 5; user++)
      await db.assistantWhatsAppUsageBucket.create({
        data: {
          ...fixtureScope(user),
          ...window("DAY", now),
          ingress: WHATSAPP_TRANSPORT_LIMITS.DAY.user.ingress,
        },
      })
    expect((await reserve(fixtureScope(5), "ingress", now)).allowed).toBe(false)
    expect((await reserve(fixtureScope(5, 1), "ingress", now)).allowed).toBe(
      true,
    )
  }, 90_000)
  test("delivery is separate from input allowance and rollback does not consume transport quota", async () => {
    const scope = fixtureScope()
    const now = new Date()
    for (const kind of ["MINUTE", "DAY"] as const)
      await db.assistantWhatsAppUsageBucket.create({
        data: {
          ...scope,
          ...window(kind, now),
          ingress: WHATSAPP_TRANSPORT_LIMITS[kind].user.ingress,
          deliveryAttempts:
            WHATSAPP_TRANSPORT_LIMITS[kind].user.deliveryAttempts - 1,
        },
      })
    await expect(
      runInOwnSerializableTransaction(db, async (tx) => {
        expect(
          (
            await reserveAssistantWhatsAppTransportInTransaction(
              tx,
              scope,
              "deliveryAttempts",
              now,
            )
          ).allowed,
        ).toBe(true)
        throw Error("synthetic later write failure")
      }),
    ).rejects.toThrow("synthetic later write failure")
    expect((await reserve(scope, "deliveryAttempts", now)).allowed).toBe(true)
    expect((await reserve(scope, "deliveryAttempts", now)).allowed).toBe(false)
    const day = await db.assistantWhatsAppUsageBucket.findFirstOrThrow({
      where: { ...scope, windowKind: "DAY" },
    })
    expect(day.deliveryAttempts).toBe(
      WHATSAPP_TRANSPORT_LIMITS.DAY.user.deliveryAttempts,
    )
    expect(day.ingress).toBe(WHATSAPP_TRANSPORT_LIMITS.DAY.user.ingress)
  }, 90_000)
})
