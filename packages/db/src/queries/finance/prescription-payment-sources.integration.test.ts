import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  attachPrescriptionRefundProviderResult,
  createPrescriptionRefund,
  processPrescriptionPaymentProviderEvent,
} from "../prescription-payments"
import { createFinanceBook } from "./accounts"

describeWithServiceCommerceDatabase(
  "prescription financial source coordination",
  () => {
    test("serializes distinct collection callbacks and both refund-success paths", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const user = await db.user.create({
        data: {
          name: "Source coordination QA",
          email: `source-coordination-${runId}@example.invalid`,
        },
      })
      let tenantId: string | undefined
      let bookId: string | undefined
      try {
        const tenant = await db.tenant.create({
          data: {
            name: "Source coordination QA",
            slug: `source-coordination-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const book = await createFinanceBook(db, {
          tenantId,
          actorUserId: user.id,
          startsAt: new Date("2026-01-01"),
        })
        bookId = book.id
        const store = await db.store.create({
          data: {
            tenantId,
            name: "Source coordination store",
            slug: "source-store",
            status: "ACTIVE",
          },
        })
        const customer = await db.customer.create({
          data: { tenantId, name: "Source QA customer" },
        })
        await db.customerLedgerAccount.create({
          data: { tenantId, customerId: customer.id, currencyCode: "NGN" },
        })
        const order = await db.commercialOrder.create({
          data: {
            tenantId,
            storeId: store.id,
            customerId: customer.id,
            clientOrderId: runId,
            payloadHash: "source-coordination-fixture",
            orderNumber: "SOURCE-QA-1",
            currencyCode: "NGN",
            subtotalMinor: 10000,
            totalMinor: 10000,
            createdByUserId: user.id,
          },
        })
        const intent = await db.prescriptionPaymentIntent.create({
          data: {
            tenantId,
            storeId: store.id,
            orderId: order.id,
            clientPaymentId: runId,
            provider: "source-qa",
            providerReference: `source-qa:${runId}`,
            statusTokenDigest: runId,
            currencyCode: "NGN",
            amountMinor: 10000,
            status: "PENDING",
          },
        })
        const callback = {
          provider: intent.provider,
          providerReference: intent.providerReference,
          currencyCode: intent.currencyCode,
          amountMinor: intent.amountMinor,
          status: "paid" as const,
        }
        const collectionEvents = [
          `${runId}:collection-a`,
          `${runId}:collection-b`,
        ]
        await Promise.all(
          collectionEvents.map((eventId) =>
            processPrescriptionPaymentProviderEvent(db, {
              ...callback,
              eventId,
            }),
          ),
        )
        expect(
          await db.commercialOrderPayment.count({ where: { tenantId } }),
        ).toBe(1)
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: order.id },
            })
          ).amountPaidMinor,
        ).toBe(10000)
        expect(
          (
            await db.prescriptionPaymentIntent.findUniqueOrThrow({
              where: { id: intent.id },
            })
          ).status,
        ).toBe("PAID")
        expect(
          await db.prescriptionPaymentProviderEvent.count({
            where: { paymentIntentId: intent.id },
          }),
        ).toBe(2)
        await expect(
          processPrescriptionPaymentProviderEvent(db, {
            ...callback,
            eventId: collectionEvents[0] ?? "",
          }),
        ).resolves.toEqual({ replay: true })
        await expect(
          processPrescriptionPaymentProviderEvent(db, {
            ...callback,
            eventId: collectionEvents[0] ?? "",
            amountMinor: 9999,
          }),
        ).rejects.toMatchObject({ code: "EVENT_CONFLICT" })
        await expect(
          processPrescriptionPaymentProviderEvent(db, {
            ...callback,
            eventId: `${runId}:wrong-provider`,
            provider: "different-provider",
          }),
        ).rejects.toMatchObject({ code: "PAYMENT_CONFLICT" })
        const scope = { tenantId, storeId: store.id }
        const refundCommand = {
          ...scope,
          orderId: order.id,
          actorUserId: user.id,
          amountMinor: 2500,
          clientRefundId: `${runId}:refund-command`,
          reason: "QA source correction",
        }
        const refunds = await Promise.all([
          createPrescriptionRefund(db, refundCommand),
          createPrescriptionRefund(db, refundCommand),
        ])
        expect(refunds[0]?.refund.id).toBe(refunds[1]?.refund.id)
        expect(refunds.filter((result) => result.replay)).toHaveLength(1)
        expect(
          await db.prescriptionPaymentRefund.count({ where: { tenantId } }),
        ).toBe(1)
        const refund = refunds[0]?.refund
        if (!refund) throw new Error("Refund fixture was not created")
        const providerRefundId = `${runId}:provider-refund`
        await attachPrescriptionRefundProviderResult(db, {
          ...scope,
          refundId: refund.id,
          providerRefundId,
          status: "pending",
        })
        const refundEvent = {
          ...callback,
          amountMinor: 2500,
          eventId: `${runId}:refund-success`,
          providerRefundId,
          status: "refund_succeeded" as const,
        }
        await Promise.all([
          processPrescriptionPaymentProviderEvent(db, refundEvent),
          attachPrescriptionRefundProviderResult(db, {
            ...scope,
            refundId: refund.id,
            providerRefundId,
            status: "succeeded",
          }),
        ])
        expect(
          await db.commercialOrderPayment.count({
            where: { tenantId, type: "REFUND" },
          }),
        ).toBe(1)
        expect(
          (
            await db.commercialOrder.findUniqueOrThrow({
              where: { id: order.id },
            })
          ).amountPaidMinor,
        ).toBe(7500)
        const successful = await db.prescriptionPaymentRefund.findUniqueOrThrow(
          { where: { id: refund.id } },
        )
        expect(successful.status).toBe("SUCCEEDED")
        expect(successful.completedAt).not.toBeNull()
        expect(
          (
            await db.prescriptionPaymentIntent.findUniqueOrThrow({
              where: { id: intent.id },
            })
          ).status,
        ).toBe("PARTIALLY_REFUNDED")
        const pendingReplay = await attachPrescriptionRefundProviderResult(db, {
          ...scope,
          refundId: refund.id,
          providerRefundId,
          status: "pending",
        })
        expect(pendingReplay.status).toBe("SUCCEEDED")
        expect(pendingReplay.completedAt).toEqual(successful.completedAt)
        await processPrescriptionPaymentProviderEvent(db, {
          ...refundEvent,
          eventId: `${runId}:late-refund-failure`,
          status: "refund_failed",
        })
        expect(
          (
            await db.prescriptionPaymentRefund.findUniqueOrThrow({
              where: { id: refund.id },
            })
          ).status,
        ).toBe("SUCCEEDED")
        await expect(
          processPrescriptionPaymentProviderEvent(db, {
            ...refundEvent,
            eventId: `${runId}:unbound-refund`,
            providerRefundId: undefined,
          }),
        ).rejects.toMatchObject({ code: "REFUND_CONFLICT" })
        await expect(
          processPrescriptionPaymentProviderEvent(db, {
            ...refundEvent,
            eventId: `${runId}:wrong-refund-amount`,
            amountMinor: 2501,
          }),
        ).rejects.toMatchObject({ code: "REFUND_CONFLICT" })
        await expect(
          createPrescriptionRefund(db, {
            ...refundCommand,
            clientRefundId: `${runId}:over-refund`,
            amountMinor: 9000,
          }),
        ).rejects.toMatchObject({ code: "REFUND_CONFLICT" })
        expect(
          await db.commercialOrderPayment.count({ where: { tenantId } }),
        ).toBe(2)
        expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(
          0,
        )
        expect(
          await db.customerLedgerEntry.count({ where: { tenantId } }),
        ).toBe(0)
        // Automatic finance activation is intentionally still off; this proves source
        // coordination/retry behavior rather than claiming journal rollout acceptance.
      } finally {
        if (tenantId)
          await db.$transaction(
            async (tx) => {
              await tx.prescriptionPaymentProviderEvent.deleteMany({
                where: { paymentIntent: { tenantId } },
              })
              await tx.prescriptionPaymentRefund.deleteMany({
                where: { tenantId },
              })
              await tx.prescriptionPaymentIntent.deleteMany({
                where: { tenantId },
              })
              await tx.prescriptionUsageEvent.deleteMany({
                where: { tenantId },
              })
              await tx.commercialOrderPayment.deleteMany({
                where: { tenantId },
              })
              await tx.commercialOrder.deleteMany({ where: { tenantId } })
              await tx.customerLedgerAccount.deleteMany({ where: { tenantId } })
              if (bookId) {
                await tx.financeAccount.deleteMany({ where: { bookId } })
                await tx.financeBook.delete({ where: { id: bookId } })
              }
              await tx.tenant.delete({ where: { id: tenantId } })
            },
            { maxWait: 10000, timeout: 30000 },
          )
        await db.user.delete({ where: { id: user.id } })
      }
    }, 360000)
  },
)
