import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import {
  countMyBusinessNotifications,
  listMyBusinessNotifications,
  markAllMyBusinessNotificationsRead,
  updateMyBusinessNotificationReceipts,
} from "../business-notifications/inbox"
import {
  readMyNotificationPreferences,
  readNotificationPolicy,
  updateMyNotificationPreferences,
  updateNotificationPolicy,
  updateNotificationSubscription,
} from "../business-notifications/settings"
import { getBusinessActivityFiltersInTransaction } from "./filters"
import {
  businessActivityPrivacyNeedsDisposition,
  getBusinessActivityPrivacyInventory,
} from "./privacy"
import {
  getBusinessActivityInTransaction,
  listBusinessActivityInTransaction,
} from "./read"
import { recordBusinessActivityInTransaction } from "./record"

const connected =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip
class Rollback extends Error {}
let db: PrismaClient

beforeAll(async () => {
  if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== "1") return
  assertQaAccessAcceptanceDatabase()
  if (
    new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
    "/ewatrade_qa_v1"
  )
    throw Error(
      "Business Activity checks require the authorized ewatrade_qa_v1 target.",
    )
  const { PrismaClient } = await import("../../../generated/prisma/client")
  const { PrismaPg } = await import("@prisma/adapter-pg")
  db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 20_000,
      query_timeout: 25_000,
    }),
  })
  await db.$queryRaw`SELECT 1`
}, 30_000)
afterAll(async () => {
  if (db) await db.$disconnect()
})

function fixtureIds() {
  return {
    tenantId: randomUUID(),
    userId: randomUUID(),
    membershipId: randomUUID(),
    storeId: randomUUID(),
    cashierUserId: randomUUID(),
    cashierMembershipId: randomUUID(),
    ownerOrderId: randomUUID(),
    cashierOrderId: randomUUID(),
    paymentId: randomUUID(),
    refundId: randomUUID(),
  }
}
type Ids = ReturnType<typeof fixtureIds>

async function seed(tx: Prisma.TransactionClient, ids: Ids) {
  await tx.tenant.create({
    data: {
      id: ids.tenantId,
      slug: `activity-${ids.tenantId}`,
      name: "Activity QA",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      qaSourceDomain: "business-activity.test",
      qaMarkedAt: new Date(),
    },
  })
  await tx.user.create({
    data: {
      id: ids.userId,
      email: `activity-${ids.userId}@example.test`,
      name: "Activity Owner",
    },
  })
  await tx.membership.create({
    data: {
      id: ids.membershipId,
      tenantId: ids.tenantId,
      userId: ids.userId,
      role: "OWNER",
      status: "ACTIVE",
    },
  })
  await tx.store.create({
    data: {
      id: ids.storeId,
      tenantId: ids.tenantId,
      slug: ids.storeId,
      name: "QA Store",
      status: "ACTIVE",
    },
  })
}
function command(ids: Ids) {
  return {
    tenantId: ids.tenantId,
    storeId: ids.storeId,
    type: "order.recorded" as const,
    source: {
      kind: "commercial_order",
      id: "synthetic-original",
      action: "created",
    },
    actor: { kind: "staff" as const, userId: ids.userId },
    origin: { channel: "assistant" as const },
    occurredAt: "2026-10-14T08:00:00Z",
    payload: {
      orderId: "synthetic-original",
      orderNumber: "QA-001",
      customerLabel: null,
      amount: { minor: "90000", currencyCode: "NGN" },
      status: "CONFIRMED",
    },
  }
}

async function rolledBack(
  ids: Ids,
  run: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  try {
    await db.$transaction(
      async (tx) => {
        await seed(tx, ids)
        await run(tx)
        throw new Rollback()
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
    throw Error("Fixture transaction unexpectedly committed.")
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  } finally {
    // These exact preplanned IDs must be absent even after a failed assertion.
    expect(
      await db.businessActivityEvent.count({
        where: { tenantId: ids.tenantId },
      }),
    ).toBe(0)
    expect(
      await db.businessActivityOutbox.count({
        where: { tenantId: ids.tenantId },
      }),
    ).toBe(0)
    expect(await db.tenant.count({ where: { id: ids.tenantId } })).toBe(0)
    expect(
      await db.user.count({
        where: { id: { in: [ids.userId, ids.cashierUserId] } },
      }),
    ).toBe(0)
    expect(
      await db.commercialOrder.count({
        where: { id: { in: [ids.ownerOrderId, ids.cashierOrderId] } },
      }),
    ).toBe(0)
    expect(
      await db.commercialOrderPayment.count({
        where: { id: { in: [ids.paymentId, ids.refundId] } },
      }),
    ).toBe(0)
  }
}

// Synthetic event/source controls, not canonical Order creation or producer acceptance.
connected("Business Activity transactional recording", () => {
  test("legacy Order/payment facts are scoped, deduplicated and never invent original Order money/status", async () => {
    const ids = fixtureIds()
    await rolledBack(ids, async (tx) => {
      await tx.user.create({
        data: {
          id: ids.cashierUserId,
          name: "QA Cashier",
          email: `${ids.cashierUserId}@example.test`,
        },
      })
      await tx.membership.create({
        data: {
          id: ids.cashierMembershipId,
          tenantId: ids.tenantId,
          userId: ids.cashierUserId,
          role: "CASHIER",
          status: "ACTIVE",
          staffAccessMode: "SCOPED",
        },
      })
      await tx.staffStoreAssignment.create({
        data: {
          tenantId: ids.tenantId,
          membershipId: ids.cashierMembershipId,
          storeId: ids.storeId,
          role: "CASHIER",
          status: "ACTIVE",
          updatedByUserId: ids.userId,
        },
      })
      await tx.commercialOrder.createMany({
        data: [
          {
            id: ids.ownerOrderId,
            tenantId: ids.tenantId,
            storeId: ids.storeId,
            clientOrderId: ids.ownerOrderId,
            payloadHash: ids.ownerOrderId,
            orderNumber: "QA-OWNER",
            createdByUserId: ids.userId,
            currencyCode: "NGN",
            subtotalMinor: 150000,
            totalMinor: 150000,
            status: "COMPLETED",
            createdAt: new Date("2026-10-14T07:00:00Z"),
          },
          {
            id: ids.cashierOrderId,
            tenantId: ids.tenantId,
            storeId: ids.storeId,
            clientOrderId: ids.cashierOrderId,
            payloadHash: ids.cashierOrderId,
            orderNumber: "QA-CASHIER",
            createdByUserId: ids.cashierUserId,
            currencyCode: "NGN",
            subtotalMinor: 150000,
            totalMinor: 150000,
            status: "COMPLETED",
            createdAt: new Date("2026-10-14T07:01:00Z"),
          },
        ],
      })
      await tx.commercialOrderPayment.createMany({
        data: [
          {
            id: ids.paymentId,
            tenantId: ids.tenantId,
            storeId: ids.storeId,
            orderId: ids.cashierOrderId,
            clientPaymentId: ids.paymentId,
            type: "PAYMENT",
            method: "CASH",
            amountMinor: 12500,
            recordedByUserId: ids.userId,
            recordedAt: new Date("2026-10-14T07:02:00Z"),
          },
          {
            id: ids.refundId,
            tenantId: ids.tenantId,
            storeId: ids.storeId,
            orderId: ids.cashierOrderId,
            clientPaymentId: ids.refundId,
            type: "REFUND",
            method: "CASH",
            amountMinor: 2500,
            recordedByUserId: ids.cashierUserId,
            recordedAt: new Date("2026-10-14T07:03:00Z"),
          },
        ],
      })
      const input = {
        from: "2026-10-14T00:00:00Z",
        to: "2026-10-15T00:00:00Z",
        limit: 100,
      }
      const owner = { tenantId: ids.tenantId, viewerUserId: ids.userId }
      const cashier = {
        tenantId: ids.tenantId,
        viewerUserId: ids.cashierUserId,
      }
      const legacy = await listBusinessActivityInTransaction(tx, cashier, {
        ...input,
        storeIds: [ids.storeId],
      })
      expect(legacy.total).toBe(3)
      expect(
        (await listBusinessActivityInTransaction(tx, owner, input)).total,
      ).toBe(4)
      const order = legacy.items.find(
        (event) => event.type === "order.recorded",
      )
      if (!order) throw Error("Missing legacy Order")
      expect(order.amount).toBeNull()
      expect(order.statusAtEvent).toBeNull()
      expect(order.currentStatus?.value).toBe("COMPLETED")
      expect(order.coverage).toBe("legacy_fact")
      expect(order.origin).toBeNull()
      expect(
        (await getBusinessActivityInTransaction(tx, cashier, order.key)).event
          .canOpen,
      ).toBe(true)
      const refund = legacy.items.find(
        (event) => event.type === "payment.refund_recorded",
      )
      expect(refund?.amount?.minor).toBe("-2500")
      expect(
        (
          await listBusinessActivityInTransaction(tx, cashier, {
            ...input,
            types: ["payment.refund_recorded"],
          })
        ).total,
      ).toBe(1)
      const choices = await getBusinessActivityFiltersInTransaction(
        tx,
        cashier,
        {},
      )
      expect(choices.actors).toHaveLength(2)
      expect(
        choices.types.find((entry) => entry.type === "order.recorded")
          ?.availability,
      ).toBe("legacy")
      expect(
        choices.types.find((entry) => entry.type === "order.recorded")?.supports
          .inApp,
      ).toBe(false)
      expect(
        await tx.businessActivityEvent.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(0)
      expect(
        await tx.businessActivityOutbox.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(0)
      const snapshot = await recordBusinessActivityInTransaction(tx, {
        ...command(ids),
        source: {
          kind: "commercial_order",
          id: ids.cashierOrderId,
          action: "created",
        },
        actor: { kind: "staff", userId: ids.cashierUserId },
        occurredAt: "2026-10-14T07:01:00Z",
        payload: {
          ...command(ids).payload,
          orderId: ids.cashierOrderId,
          orderNumber: "QA-CASHIER",
        },
      })
      const merged = await listBusinessActivityInTransaction(tx, cashier, input)
      expect(merged.total).toBe(3)
      expect(
        merged.items.filter((event) => event.type === "order.recorded"),
      ).toHaveLength(1)
      expect(
        merged.items.find((event) => event.key === snapshot.id)?.amount?.minor,
      ).toBe("90000")
      expect(
        (await getBusinessActivityInTransaction(tx, cashier, order.key)).event
          .key,
      ).toBe(snapshot.id)
    })
  }, 50_000)
  test("privacy inventory retains non-cascading attribution while a removed actor is never reconstructed", async () => {
    const ids = fixtureIds()
    await rolledBack(ids, async (tx) => {
      const event = await recordBusinessActivityInTransaction(tx, command(ids))
      await tx.businessNotificationPreference.create({
        data: {
          tenantId: ids.tenantId,
          membershipId: ids.membershipId,
          type: "order.recorded",
        },
      })
      const before = await getBusinessActivityPrivacyInventory(tx, ids.userId)
      expect(before.recordedActorLinks).toBe(1)
      expect(before.personalPreferences).toBe(1)
      expect(businessActivityPrivacyNeedsDisposition(before)).toBe(true)
      await tx.membership.delete({ where: { id: ids.membershipId } })
      await tx.user.delete({ where: { id: ids.userId } })
      const after = await getBusinessActivityPrivacyInventory(tx, ids.userId)
      expect(after.recordedActorLinks).toBe(1)
      expect(after.personalPreferences).toBe(0)
      expect(businessActivityPrivacyNeedsDisposition(after)).toBe(true)
      await tx.user.create({
        data: {
          id: ids.cashierUserId,
          name: "Other Owner",
          email: `${ids.cashierUserId}@example.test`,
        },
      })
      await tx.membership.create({
        data: {
          id: ids.cashierMembershipId,
          tenantId: ids.tenantId,
          userId: ids.cashierUserId,
          role: "OWNER",
          status: "ACTIVE",
        },
      })
      const detail = await getBusinessActivityInTransaction(
        tx,
        { tenantId: ids.tenantId, viewerUserId: ids.cashierUserId },
        event.id,
      )
      expect(detail.event.actor.membershipId).toBeNull()
      expect(detail.event.actor.name).toBeNull()
      expect(detail.event.actor.coverage).toBe("unavailable")
      expect(JSON.stringify(detail).includes(ids.userId)).toBe(false)
    })
  }, 50_000)
  test("alert configuration revisions and self-only receipt controls stay disabled before producer acceptance", async () => {
    const ids = fixtureIds()
    await rolledBack(ids, async (tx) => {
      const viewer = { tenantId: ids.tenantId, viewerUserId: ids.userId }
      const catalog = await readNotificationPolicy(tx, viewer)
      expect(
        catalog.catalog.every(
          (type) => !type.supports.email && !type.supports.inApp,
        ),
      ).toBe(true)
      const input = {
        type: "order.recorded" as const,
        allowed: { inApp: false, email: false },
        defaults: { inApp: false, email: false },
        recipientRoles: ["OWNER"],
        expectedRevision: 0,
      }
      const policy = await updateNotificationPolicy(tx, viewer, input)
      expect(policy.revision).toBe(1)
      await expect(
        updateNotificationPolicy(tx, viewer, input),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        updateNotificationPolicy(tx, viewer, {
          ...input,
          expectedRevision: 1,
          allowed: { inApp: false, email: true },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
      const subscription = await updateNotificationSubscription(tx, viewer, {
        membershipId: ids.membershipId,
        type: "order.recorded",
        enabled: true,
        allowed: { inApp: false, email: false },
        scope: { kind: "stores", storeIds: [ids.storeId] },
        expectedRevision: 0,
      })
      expect(subscription.effective.inApp).toBe(false)
      expect(subscription.blockedReason).toBe("unsupported_type")
      expect(subscription.effectiveStoreIds).toEqual([ids.storeId])
      const preferences = await readMyNotificationPreferences(tx, viewer)
      expect(preferences.items).toHaveLength(1)
      expect(preferences.items[0]?.effective.inApp).toBe(false)
      await expect(
        updateMyNotificationPreferences(tx, viewer, {
          type: "order.recorded",
          preference: { inApp: "on", email: "inherit" },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      const off = await updateMyNotificationPreferences(tx, viewer, {
        type: "order.recorded",
        preference: { inApp: "off", email: "off" },
      })
      expect(off.preference.inApp).toBe("off")
      const event = await recordBusinessActivityInTransaction(tx, command(ids))
      const receipt = await tx.businessNotificationReceipt.create({
        data: {
          tenantId: ids.tenantId,
          membershipId: ids.membershipId,
          eventId: event.id,
          occurredAt: new Date(command(ids).occurredAt),
        },
      })
      expect(
        (await listMyBusinessNotifications(tx, viewer, {})).items,
      ).toHaveLength(0)
      expect((await countMyBusinessNotifications(tx, viewer)).count).toBe(0)
      await expect(
        updateMyBusinessNotificationReceipts(tx, viewer, "read", {
          receiptIds: [receipt.id],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      expect(
        (
          await markAllMyBusinessNotificationsRead(tx, viewer, {
            through: new Date().toISOString(),
          })
        ).updated,
      ).toBe(0)
      expect(
        (
          await tx.businessNotificationReceipt.findUniqueOrThrow({
            where: { id: receipt.id },
          })
        ).state,
      ).toBe("UNREAD")
    })
  }, 50_000)
  test("scoped reads filter before paging/count, preserve event snapshots and refuse changed-access cursors", async () => {
    const ids = fixtureIds()
    await rolledBack(ids, async (tx) => {
      const cashierId = ids.cashierUserId
      const cashierMembershipId = ids.cashierMembershipId
      await tx.user.create({
        data: {
          id: cashierId,
          name: "QA Cashier",
          email: `${cashierId}@example.test`,
        },
      })
      await tx.membership.create({
        data: {
          id: cashierMembershipId,
          tenantId: ids.tenantId,
          userId: cashierId,
          role: "CASHIER",
          status: "ACTIVE",
          staffAccessMode: "SCOPED",
        },
      })
      await tx.staffStoreAssignment.create({
        data: {
          tenantId: ids.tenantId,
          membershipId: cashierMembershipId,
          storeId: ids.storeId,
          role: "CASHIER",
          status: "ACTIVE",
          updatedByUserId: ids.userId,
        },
      })
      const originals = [
        { id: ids.ownerOrderId, actor: ids.userId, number: "QA-OWNER" },
        { id: ids.cashierOrderId, actor: cashierId, number: "QA-CASHIER" },
      ]
      await tx.commercialOrder.createMany({
        data: originals.map((order) => ({
          id: order.id,
          tenantId: ids.tenantId,
          storeId: ids.storeId,
          clientOrderId: order.id,
          payloadHash: order.id,
          orderNumber: order.number,
          createdByUserId: order.actor,
          currencyCode: "NGN",
          subtotalMinor: 90000,
          totalMinor: 90000,
          status: "CONFIRMED",
        })),
      })
      const recorded: string[] = []
      for (const original of originals) {
        const saved = await recordBusinessActivityInTransaction(tx, {
          ...command(ids),
          source: {
            kind: "commercial_order",
            id: original.id,
            action: "created",
          },
          actor: { kind: "staff", userId: original.actor },
          payload: {
            ...command(ids).payload,
            orderId: original.id,
            orderNumber: original.number,
          },
        })
        recorded.push(saved.id)
      }
      const input = {
        from: "2026-10-14T00:00:00Z",
        to: "2026-10-15T00:00:00Z",
        limit: 1,
      }
      const owner = { tenantId: ids.tenantId, viewerUserId: ids.userId }
      const cashier = { tenantId: ids.tenantId, viewerUserId: cashierId }
      const own = await listBusinessActivityInTransaction(tx, cashier, input)
      expect(own.total).toBe(1)
      expect(own.items[0]?.actor.membershipId).toBe(cashierMembershipId)
      const page = await listBusinessActivityInTransaction(tx, owner, input)
      expect(page.total).toBe(2)
      expect(page.nextCursor).not.toBeNull()
      const next = await listBusinessActivityInTransaction(tx, owner, {
        ...input,
        cursor: page.nextCursor ?? undefined,
      })
      expect(next.items[0]?.key).not.toBe(page.items[0]?.key)
      await expect(
        listBusinessActivityInTransaction(tx, cashier, {
          ...input,
          cursor: page.nextCursor ?? undefined,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
      const ownerEvent = recorded[0]
      if (!ownerEvent) throw Error("Missing owned event identity.")
      await expect(
        getBusinessActivityInTransaction(tx, cashier, ownerEvent),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      const original = originals[0]
      if (!original) throw Error("Missing original identity.")
      await tx.commercialOrder.update({
        where: { id: original.id },
        data: { totalMinor: 100000, status: "COMPLETED" },
      })
      const detail = await getBusinessActivityInTransaction(
        tx,
        owner,
        ownerEvent,
      )
      expect(detail.event.amount?.minor).toBe("90000")
      expect(detail.event.statusAtEvent?.value).toBe("CONFIRMED")
      expect(detail.event.currentStatus?.value).toBe("COMPLETED")
      expect(detail.event.canOpen).toBe(true)
      const filtered = await listBusinessActivityInTransaction(tx, owner, {
        ...input,
        q: "QA-CASHIER",
      })
      expect(filtered.total).toBe(1)
      const choices = await getBusinessActivityFiltersInTransaction(
        tx,
        cashier,
        {},
      )
      expect(choices.actors.map((actor) => actor.membershipId)).toEqual([
        cashierMembershipId,
      ])
      expect(choices.canManageNotifications).toBe(false)
      expect(choices.scope).toBe("own")
      const ownerChoices = await getBusinessActivityFiltersInTransaction(
        tx,
        owner,
        {},
      )
      expect(ownerChoices.actors).toHaveLength(2)
      expect(ownerChoices.canManageNotifications).toBe(true)
      expect(
        (
          await getBusinessActivityFiltersInTransaction(tx, owner, {
            actorQuery: "%",
          })
        ).actors,
      ).toHaveLength(0)
    })
  }, 50_000)

  test("one event/outbox/scope on replay, original facts survive mismatch, and rollback leaves no fixture", async () => {
    const ids = fixtureIds()
    await rolledBack(ids, async (tx) => {
      const input = command(ids)
      const saved = await recordBusinessActivityInTransaction(tx, input)
      const replay = await recordBusinessActivityInTransaction(tx, {
        ...input,
        storeIds: [ids.storeId, ids.storeId],
      })
      expect(replay.id).toBe(saved.id)
      expect(saved.replay).toBe(false)
      expect(replay.replay).toBe(true)
      expect(
        await tx.businessActivityEvent.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(1)
      expect(
        await tx.businessActivityOutbox.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(1)
      expect(
        await tx.businessActivityStoreScope.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(1)
      const event = await tx.businessActivityEvent.findUniqueOrThrow({
        where: { id: saved.id },
      })
      expect(event.actorMembershipId).toBe(ids.membershipId)
      expect(event.originChannel).toBe("assistant")
      expect(event.amountMinor).toBe(BigInt(90000))
      await expect(
        recordBusinessActivityInTransaction(tx, {
          ...input,
          payload: {
            ...input.payload,
            amount: { minor: "100000", currencyCode: "NGN" },
          },
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(
        (
          await tx.businessActivityEvent.findUniqueOrThrow({
            where: { id: saved.id },
          })
        ).amountMinor,
      ).toBe(BigInt(90000))
    })
  }, 50_000)

  test("foreign actor/Store and suspended actor are refused before event/outbox writes", async () => {
    const ids = fixtureIds()
    await rolledBack(ids, async (tx) => {
      const input = command(ids)
      await expect(
        recordBusinessActivityInTransaction(tx, {
          ...input,
          actor: { kind: "staff", userId: randomUUID() },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        recordBusinessActivityInTransaction(tx, {
          ...input,
          storeId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      await tx.membership.update({
        where: { id: ids.membershipId },
        data: { status: "SUSPENDED" },
      })
      await expect(
        recordBusinessActivityInTransaction(tx, input),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(
        await tx.businessActivityEvent.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(0)
      expect(
        await tx.businessActivityOutbox.count({
          where: { tenantId: ids.tenantId },
        }),
      ).toBe(0)
    })
  }, 50_000)
})
