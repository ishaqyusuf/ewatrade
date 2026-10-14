import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  applyCollectionProviderEventInTransaction,
  cancelCollectionIntentInTransaction,
  openCollectionIntentInTransaction,
  recordCollectionProviderEventInTransaction,
} from "./collection-intents"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import { recordCommercialOrderPaymentInTransaction } from "./commercial-payments"

// F01 canonical commands on the guarded Development database. Everything runs
// inside one transaction that is always rolled back; no row survives. The
// separate-transaction property of provider events is not exercised here.
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
class Rollback extends Error {}

async function inRollback(
  run: (tx: Prisma.TransactionClient, ids: Fixture) => Promise<void>,
) {
  assertQaAccessAcceptanceDatabase()
  const { prisma } = await import("../client")
  await prisma
    .$transaction(
      async (tx) => {
        await run(tx, await fixture(tx))
        throw new Rollback()
      },
      { maxWait: 10_000, timeout: 110_000 },
    )
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error
    })
}
type Fixture = {
  tenantId: string
  storeId: string
  userId: string
  orderId: string
}
async function fixture(tx: Prisma.TransactionClient): Promise<Fixture> {
  const id = randomUUID()
  const tenantId = randomUUID()
  const userId = randomUUID()
  await tx.tenant.create({
    data: {
      id: tenantId,
      slug: `collections-${id}`,
      name: "Collections QA",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      qaSourceDomain: "collections.test",
      qaMarkedAt: new Date(),
    },
  })
  await tx.user.create({
    data: { id: userId, email: `collections-${id}@example.test` },
  })
  await tx.membership.create({
    data: { role: "OWNER", status: "ACTIVE", tenantId, userId },
  })
  const store = await tx.store.create({
    data: { name: "Main", slug: `main-${id}`, tenantId },
  })
  const order = await createCommercialOrderInTransaction(tx, {
    actorUserId: userId,
    clientOrderId: `collections-${id}`,
    lines: [{ amountMinor: 10_000, custom: "quick_sale" }],
    schemaVersion: 1,
    storeId: store.id,
    tenantId,
  })
  return { tenantId, storeId: store.id, userId, orderId: order.id }
}
const now = () => new Date()
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000)
;(enabled ? describe : describe.skip)(
  "collection intents on guarded Development (rolled back)",
  () => {
    test("partial link, one open link, manual payment blocked, settle once", async () => {
      await inRollback(async (tx, ids) => {
        const actor = {
          kind: "staff" as const,
          userId: ids.userId,
          storeIds: [ids.storeId],
          canAcceptPayment: true,
        }
        const open = (clientIntentId: string, amountMinor: number) =>
          openCollectionIntentInTransaction(tx, {
            tenantId: ids.tenantId,
            orderId: ids.orderId,
            clientIntentId,
            provider: "deterministic",
            amountMinor,
            currencyCode: "NGN",
            expiresAt: inHours(24),
            now: now(),
            actor,
          })
        const first = await open("link-1", 4_000)
        expect(first.replay).toBe(false)
        expect(first.intent.amountMinor).toBe(4_000)
        expect((await open("link-1", 4_000)).replay).toBe(true)
        await expect(open("link-1", 5_000)).rejects.toThrow(
          "already used with different details",
        )
        await expect(open("link-2", 6_000)).rejects.toThrow(
          "already open for this order",
        )
        // Manual payment waits while the link can still be paid.
        await expect(
          recordCommercialOrderPaymentInTransaction(tx, {
            actorUserId: ids.userId,
            amountMinor: 1_000,
            clientPaymentId: "manual-1",
            method: "cash",
            orderId: ids.orderId,
            tenantId: ids.tenantId,
          }),
        ).rejects.toThrow("online payment link for this order is still open")
        // Provider success settles once; a duplicate delivery is a replay.
        const paid = {
          provider: "deterministic",
          providerEventId: "evt-paid-1",
          providerReference: first.intent.providerReference,
          status: "paid" as const,
          amountMinor: 4_000,
          currencyCode: "NGN",
        }
        const recorded = await recordCollectionProviderEventInTransaction(
          tx,
          paid,
        )
        expect(
          await applyCollectionProviderEventInTransaction(tx, {
            eventId: recorded.event.id,
          }),
        ).toMatchObject({ outcome: "APPLIED", replay: false })
        expect(
          (await recordCollectionProviderEventInTransaction(tx, paid)).replay,
        ).toBe(true)
        expect(
          await applyCollectionProviderEventInTransaction(tx, {
            eventId: recorded.event.id,
          }),
        ).toMatchObject({ outcome: "APPLIED", replay: true })
        const order = await tx.commercialOrder.findUniqueOrThrow({
          where: { id: ids.orderId },
          include: { payments: true },
        })
        expect(order.payments.map((p) => p.amountMinor)).toEqual([4_000])
        // With the link paid, manual payment of the rest is allowed.
        await recordCommercialOrderPaymentInTransaction(tx, {
          actorUserId: ids.userId,
          amountMinor: 6_000,
          clientPaymentId: "manual-2",
          method: "cash",
          orderId: ids.orderId,
          tenantId: ids.tenantId,
        })
      })
    })

    test("money arriving after a manual settlement is held, never dropped", async () => {
      await inRollback(async (tx, ids) => {
        const { intent } = await openCollectionIntentInTransaction(tx, {
          tenantId: ids.tenantId,
          orderId: ids.orderId,
          clientIntentId: "link-held",
          provider: "deterministic",
          amountMinor: 10_000,
          currencyCode: "NGN",
          expiresAt: inHours(1),
          now: now(),
          actor: {
            kind: "staff",
            userId: ids.userId,
            storeIds: "all",
            canAcceptPayment: true,
          },
        })
        await cancelCollectionIntentInTransaction(tx, {
          tenantId: ids.tenantId,
          intentId: intent.id,
          actorUserId: ids.userId,
        })
        await recordCommercialOrderPaymentInTransaction(tx, {
          actorUserId: ids.userId,
          amountMinor: 10_000,
          clientPaymentId: "manual-full",
          method: "cash",
          orderId: ids.orderId,
          tenantId: ids.tenantId,
        })
        const late = await recordCollectionProviderEventInTransaction(tx, {
          provider: "deterministic",
          providerEventId: "evt-late",
          providerReference: intent.providerReference,
          status: "paid",
          amountMinor: 10_000,
          currencyCode: "NGN",
        })
        expect(
          await applyCollectionProviderEventInTransaction(tx, {
            eventId: late.event.id,
          }),
        ).toMatchObject({ outcome: "HELD", reason: "source_already_settled" })
        const hold = await tx.collectionHold.findUniqueOrThrow({
          where: { eventId: late.event.id },
        })
        expect(hold).toMatchObject({
          amountMinor: 10_000,
          currencyCode: "NGN",
          reason: "source_already_settled",
          resolution: null,
        })
        // Unknown references are kept as evidence and never applied.
        const stray = await recordCollectionProviderEventInTransaction(tx, {
          provider: "deterministic",
          providerEventId: "evt-stray",
          providerReference: "col_unknown",
          status: "paid",
          amountMinor: 500,
          currencyCode: null,
        })
        expect(stray.event).toMatchObject({
          intentId: null,
          outcome: "REJECTED",
          holdReason: "unknown_reference",
          currencyCode: null,
        })
      })
    })
  },
)
