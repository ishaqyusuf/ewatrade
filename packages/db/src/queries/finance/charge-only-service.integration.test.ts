import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createCommercialOrder, getCommercialOrder } from "../commercial-orders"
import { recordCommercialOrderPayment } from "../commercial-payments"
import { authorizeCommercialOrderChargeOnlyServiceLine } from "../commercial-service-authorization"
import { fulfillCommercialOrderChargeOnlyServiceLine } from "../commercial-service-fulfillment"
import { createFinanceBook } from "./accounts"
import { postCommerceFinanceJournalInTransaction } from "./posting"

function postingEntryId(result: unknown) {
  if (
    !result ||
    typeof result !== "object" ||
    !("entryId" in result) ||
    typeof result.entryId !== "string"
  )
    throw new Error("Expected a source journal posting result")
  return result.entryId
}

describeWithServiceCommerceDatabase(
  "charge-only Service performance on verified development",
  () => {
    test("retains sale policy, serializes explicit performance and reconciles earning", async () => {
      const { prisma: db } = await import("../../client")
      const suffix = randomUUID()
      let tenantId: string | undefined
      let userId: string | undefined
      let bookId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: `charge-only-${suffix}@example.invalid`,
            name: "Charge-only Service acceptance",
          },
        })
        userId = user.id
        const tenant = await db.tenant.create({
          data: {
            name: "Charge-only Service acceptance",
            slug: `charge-only-${suffix}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Charge-only acceptance",
            slug: `charge-only-${suffix}`,
            status: "ACTIVE",
          },
        })
        const book = await createFinanceBook(db, {
          actorUserId: user.id,
          tenantId: tenant.id,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        bookId = book.id
        const item = await db.catalogItem.create({
          data: {
            tenantId: tenant.id,
            kind: "SERVICE",
            name: "QA untracked service",
            slug: `service-${suffix}`,
            status: "ACTIVE",
            service: { create: {} },
          },
        })
        const variant = await db.sellableVariant.create({
          data: {
            catalogItemId: item.id,
            isDefault: true,
            key: "default",
            name: "Default",
            status: "ACTIVE",
          },
        })
        const offering = await db.sellableOffering.create({
          data: {
            catalogItemId: item.id,
            tenantId: tenant.id,
            variantId: variant.id,
            kind: "SERVICE",
            key: "untracked",
            name: "Untracked service",
            status: "ACTIVE",
            currencyCode: "NGN",
            pricingPolicy: "FIXED",
            fixedPriceMinor: 1_000,
            serviceOffering: {
              create: {
                workPolicy: "CHARGE_ONLY",
                authorizationPolicy: "ON_ORDER_CONFIRMATION",
              },
            },
            storeAvailability: {
              create: { storeId: store.id, isAvailable: true },
            },
          },
        })
        const createOrder = (key: string, quantities: string[]) =>
          createCommercialOrder(db, {
            actorUserId: user.id,
            tenantId: tenant.id,
            storeId: store.id,
            clientOrderId: `${key}:${suffix}`,
            schemaVersion: 1,
            lines: quantities.map((quantity) => ({
              offeringId: offering.id,
              quantity,
            })),
          })
        const order = await createOrder("untracked-order", ["2", "1"])
        const [first, second] = order.lines
        if (!first || !second) throw new Error("Missing two-line Order fixture")
        expect(first.snapshot?.serviceWorkPolicy).toBe("CHARGE_ONLY")
        expect(first.snapshot?.serviceAuthorizationPolicy).toBe(
          "ON_ORDER_CONFIRMATION",
        )
        expect(
          await db.serviceJob.count({ where: { commercialOrderId: order.id } }),
        ).toBe(0)
        await db.serviceOffering.update({
          where: { offeringId: offering.id },
          data: {
            workPolicy: "TRACKED",
            authorizationPolicy: "AFTER_REQUIRED_PAYMENT",
          },
        })
        const post = (event: "BILLED" | "EARNED") =>
          db.$transaction((tx) =>
            postCommerceFinanceJournalInTransaction(tx, {
              tenantId: tenant.id,
              orderId: order.id,
              event,
            }),
          )
        expect(await post("BILLED")).not.toBeNull()
        expect(await post("EARNED")).toBeNull()
        const perform = (lineId: string, key: string) => ({
          actorUserId: user.id,
          tenantId: tenant.id,
          orderLineId: lineId,
          clientOperationId: `${key}:${suffix}`,
          reason: "Merchant confirms the complete service was performed",
          schemaVersion: 1,
        })
        const firstSource = await fulfillCommercialOrderChargeOnlyServiceLine(
          db,
          perform(first.id, "first-performance"),
        )
        expect(firstSource.quantity).toBe("2")
        expect(
          await db.commercialOrder.findUniqueOrThrow({
            where: { id: order.id },
            select: { status: true, completedAt: true },
          }),
        ).toEqual({ status: "FULFILLING", completedAt: null })
        expect(await post("EARNED")).toBeNull()
        const secondInput = perform(second.id, "second-performance")
        const [winner, replay] = await Promise.all([
          fulfillCommercialOrderChargeOnlyServiceLine(db, secondInput),
          fulfillCommercialOrderChargeOnlyServiceLine(db, secondInput),
        ])
        expect(replay.id).toBe(winner.id)
        expect(replay.performedAt).toEqual(winner.performedAt)
        const completed = await db.commercialOrder.findUniqueOrThrow({
          where: { id: order.id },
          select: { status: true, completedAt: true },
        })
        expect(completed.status).toBe("COMPLETED")
        expect(completed.completedAt).toEqual(winner.performedAt)
        expect(
          await db.commercialServiceFulfillment.count({
            where: { tenantId: tenant.id },
          }),
        ).toBe(2)
        const earned = await post("EARNED")
        expect(earned).not.toBeNull()
        if (!earned) throw new Error("Performed Service has no earned journal")
        const earnedEntryId = postingEntryId(earned)
        const earnedLines = await db.financeJournalLine.findMany({
          where: { entryId: earnedEntryId },
          select: {
            debitMinor: true,
            creditMinor: true,
            account: { select: { purpose: true } },
          },
        })
        expect(
          earnedLines
            .find((line) => line.account.purpose === "SALES")
            ?.creditMinor.toString(),
        ).toBe("3000")
        expect(
          earnedLines.reduce((sum, line) => sum + line.debitMinor, BigInt(0)),
        ).toBe(BigInt(3000))
        expect(
          earnedLines.reduce((sum, line) => sum + line.creditMinor, BigInt(0)),
        ).toBe(BigInt(3000))
        expect(postingEntryId(await post("EARNED"))).toBe(earnedEntryId)
        expect(
          await db.financeJournalEntry.count({
            where: { bookId: book.id, sourceKind: "COMMERCIAL_ORDER_EARNED" },
          }),
        ).toBe(1)
        expect(
          await fulfillCommercialOrderChargeOnlyServiceLine(db, secondInput),
        ).toMatchObject({ id: winner.id, performedAt: winner.performedAt })
        await expect(
          fulfillCommercialOrderChargeOnlyServiceLine(db, {
            ...secondInput,
            reason: "Changed attestation",
          }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
        await expect(
          fulfillCommercialOrderChargeOnlyServiceLine(
            db,
            perform(second.id, "new-command-same-line"),
          ),
        ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
        await expect(
          fulfillCommercialOrderChargeOnlyServiceLine(db, {
            ...secondInput,
            tenantId: "wrong-tenant",
          }),
        ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
        expect(
          (
            await getCommercialOrder(db, {
              tenantId: tenant.id,
              orderId: order.id,
            })
          )?.lines.find((line) => line.id === second.id)?.serviceFulfillment
            ?.id,
        ).toBe(winner.id)

        // A new sale captures the changed TRACKED policy and cannot use this command.
        const tracked = await createOrder("tracked-order", ["1"])
        const trackedLine = tracked.lines[0]
        if (!trackedLine) throw new Error("Missing tracked line")
        expect(trackedLine.snapshot?.serviceWorkPolicy).toBe("TRACKED")
        expect(
          await db.serviceJob.count({
            where: { commercialOrderId: tracked.id },
          }),
        ).toBe(1)
        await expect(
          fulfillCommercialOrderChargeOnlyServiceLine(
            db,
            perform(trackedLine.id, "tracked-rejected"),
          ),
        ).rejects.toMatchObject({ code: "INVALID_ORDER" })

        await db.serviceOffering.update({
          where: { offeringId: offering.id },
          data: {
            workPolicy: "CHARGE_ONLY",
            authorizationPolicy: "AFTER_REQUIRED_PAYMENT",
          },
        })
        const unpaid = await createOrder("payment-gated", ["1"])
        const unpaidLine = unpaid.lines[0]
        if (!unpaidLine) throw new Error("Missing payment-gated line")
        const gatedInput = perform(unpaidLine.id, "gated-performance")
        await expect(
          fulfillCommercialOrderChargeOnlyServiceLine(db, gatedInput),
        ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
        expect(
          await db.commercialServiceFulfillment.count({
            where: { orderId: unpaid.id },
          }),
        ).toBe(0)
        await recordCommercialOrderPayment(db, {
          actorUserId: user.id,
          tenantId: tenant.id,
          orderId: unpaid.id,
          clientPaymentId: `gated-payment:${suffix}`,
          amountMinor: 1_000,
          method: "cash",
        })
        expect(
          (await fulfillCommercialOrderChargeOnlyServiceLine(db, gatedInput))
            .quantity,
        ).toBe("1")

        await db.serviceOffering.update({
          where: { offeringId: offering.id },
          data: { authorizationPolicy: "MANUAL_RELEASE" },
        })
        const manual = await createOrder("manual-release", ["1"])
        const manualLine = manual.lines[0]
        if (!manualLine) throw new Error("Missing manual-release line")
        const releaseInput = {
          ...perform(manualLine.id, "management-release"),
          reason: "Manager approved this sold Service for performance",
        }
        const manualPerformance = perform(manualLine.id, "manual-performance")
        const postManual = (event: "BILLED" | "EARNED") =>
          db.$transaction((tx) =>
            postCommerceFinanceJournalInTransaction(tx, {
              tenantId: tenant.id,
              orderId: manual.id,
              event,
            }),
          )
        expect(postingEntryId(await postManual("BILLED"))).toBeString()
        await expect(
          fulfillCommercialOrderChargeOnlyServiceLine(db, manualPerformance),
        ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
        await db.membership.updateMany({
          where: { tenantId: tenant.id, userId: user.id },
          data: { role: "CASHIER" },
        })
        await expect(
          authorizeCommercialOrderChargeOnlyServiceLine(db, releaseInput),
        ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
        expect(
          await db.commercialServiceAuthorization.count({
            where: { orderId: manual.id },
          }),
        ).toBe(0)
        await db.membership.updateMany({
          where: { tenantId: tenant.id, userId: user.id },
          data: { role: "OWNER" },
        })
        const [release, releaseReplay] = await Promise.all([
          authorizeCommercialOrderChargeOnlyServiceLine(db, releaseInput),
          authorizeCommercialOrderChargeOnlyServiceLine(db, releaseInput),
        ])
        expect(releaseReplay.id).toBe(release.id)
        expect(releaseReplay.authorizedAt).toEqual(release.authorizedAt)
        expect(release.quantity).toBe("1")
        expect(
          await db.commercialServiceAuthorization.count({
            where: { orderId: manual.id },
          }),
        ).toBe(1)
        expect(
          (await db.commercialOrder.findUnique({ where: { id: manual.id } }))
            ?.status,
        ).toBe("CONFIRMED")
        expect(
          await db.commercialServiceFulfillment.count({
            where: { orderId: manual.id },
          }),
        ).toBe(0)
        expect(await postManual("EARNED")).toBeNull()
        await expect(
          authorizeCommercialOrderChargeOnlyServiceLine(db, {
            ...releaseInput,
            reason: "Changed management release",
          }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
        await expect(
          authorizeCommercialOrderChargeOnlyServiceLine(db, {
            ...releaseInput,
            clientOperationId: `second-release:${suffix}`,
          }),
        ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
        await db.serviceOffering.update({
          where: { offeringId: offering.id },
          data: { authorizationPolicy: "ON_ORDER_CONFIRMATION" },
        })
        await db.membership.updateMany({
          where: { tenantId: tenant.id, userId: user.id },
          data: { role: "CASHIER" },
        })
        await expect(
          authorizeCommercialOrderChargeOnlyServiceLine(db, releaseInput),
        ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
        const manualSource = await fulfillCommercialOrderChargeOnlyServiceLine(
          db,
          manualPerformance,
        )
        expect(manualSource.performedAt.getTime()).toBeGreaterThanOrEqual(
          release.authorizedAt.getTime(),
        )
        expect(
          (await db.commercialOrder.findUnique({ where: { id: manual.id } }))
            ?.status,
        ).toBe("COMPLETED")
        const manualEarnedId = postingEntryId(await postManual("EARNED"))
        expect(postingEntryId(await postManual("EARNED"))).toBe(manualEarnedId)
        expect(
          await db.financeJournalEntry.count({
            where: {
              bookId: book.id,
              sourceKind: "COMMERCIAL_ORDER_EARNED",
              sourceId: manual.id,
            },
          }),
        ).toBe(1)
        expect(
          (
            await getCommercialOrder(db, {
              tenantId: tenant.id,
              orderId: manual.id,
            })
          )?.lines[0]?.serviceAuthorization?.id,
        ).toBe(release.id)
        await db.membership.updateMany({
          where: { tenantId: tenant.id, userId: user.id },
          data: { role: "OWNER" },
        })
        expect(
          await authorizeCommercialOrderChargeOnlyServiceLine(db, releaseInput),
        ).toMatchObject({ id: release.id, authorizedAt: release.authorizedAt })
        await db.membership.updateMany({
          where: { tenantId: tenant.id, userId: user.id },
          data: { status: "SUSPENDED" },
        })
        await expect(
          fulfillCommercialOrderChargeOnlyServiceLine(db, gatedInput),
        ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
        await expect(
          authorizeCommercialOrderChargeOnlyServiceLine(db, releaseInput),
        ).rejects.toMatchObject({ code: "SERVICE_WORK_NOT_AUTHORIZED" })
      } finally {
        if (tenantId)
          await db.$transaction(async (tx) => {
            await tx.commercialServiceFulfillment.deleteMany({
              where: { tenantId },
            })
            await tx.commercialServiceAuthorization.deleteMany({
              where: { tenantId },
            })
            await tx.serviceJob.deleteMany({ where: { tenantId } })
            await tx.commercialOrderPayment.deleteMany({ where: { tenantId } })
            await tx.commercialOrder.deleteMany({ where: { tenantId } })
            await tx.catalogItem.deleteMany({ where: { tenantId } })
            if (bookId) {
              await tx.financeCommand.deleteMany({ where: { bookId } })
              await tx.financeJournalLine.deleteMany({ where: { bookId } })
              await tx.financeJournalEntry.deleteMany({ where: { bookId } })
              await tx.financeAccount.deleteMany({ where: { bookId } })
              await tx.financeBook.deleteMany({
                where: { id: bookId, tenantId },
              })
            }
            await tx.tenant.delete({ where: { id: tenantId } })
          })
        if (userId) await db.user.delete({ where: { id: userId } })
      }
    }, 360_000)
  },
)
