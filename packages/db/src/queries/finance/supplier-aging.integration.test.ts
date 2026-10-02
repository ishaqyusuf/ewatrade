import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { recordFinanceMoneyMovement } from "./money"
import {
  recognizeFinancePurchase,
  registerFinancePurchase,
} from "./purchase-recognition"
import type { PurchaseCleanupScope } from "./purchase-recognition-cleanup-scope"
import { reverseFinancePurchaseRecognition } from "./purchase-recognition-reversals"
import { cleanupPurchaseRecognitionTest } from "./purchase-recognition-test-cleanup"
import {
  allocateFinanceSupplierAdvance,
  payFinancePurchaseBill,
  releaseFinanceSupplierAllocation,
  reverseFinancePurchasePayment,
} from "./purchase-settlements"
import { getFinanceSupplierPayableAging } from "./supplier-aging"
import { getFinanceSupplierStatement } from "./supplier-reads"
import {
  createFinanceSupplier,
  recordFinanceSupplierOpening,
} from "./supplier-writes"

const artifact = resolve(
  import.meta.dir,
  "../../../../../.brain/artifacts/2026-10-02-supplier-payable-aging",
)
const startsAt = new Date("2026-01-01T00:00:00.000Z")
const date = (day: number) =>
  new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`)

function assertOwnedTarget() {
  const target = new URL(
    process.env.EWATRADE_DATABASE_URL ?? "https://missing.invalid",
  )
  if (
    process.env.RUN_DATABASE_INTEGRATION_TESTS !== "1" ||
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    process.env.DEV_PROFILE !== "local" ||
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  ) {
    throw new Error(
      "Supplier aging acceptance requires the exact authorized Neon development target.",
    )
  }
}

describeWithServiceCommerceDatabase(
  "supplier payable aging development acceptance",
  () => {
    test("original journals preserve due/undated residuals, settlement cutoffs and separate controls", async () => {
      assertOwnedTarget()
      const { prisma: db } = await import("../../client")
      const states: PurchaseCleanupScope[] = [
        { run: randomUUID(), items: [] },
        { run: randomUUID(), items: [] },
      ]
      let stage = "setup"
      let completed = false
      let operatingFailure: unknown
      const cleanupFailures: unknown[] = []
      const cleanup: Array<{
        run: string
        outcome: string
        extraChecks?: number
      }> = []
      const persist = () =>
        writeFileSync(
          resolve(artifact, "fixture-run.json"),
          JSON.stringify(
            {
              target: "authorized Neon development",
              stage,
              completed,
              states,
              cleanup,
            },
            null,
            2,
          ),
        )
      persist()
      console.log(`supplier-aging run=${states[0]?.run}`)
      async function createOwned(state: PurchaseCleanupScope) {
        const user = await db.user.create({
          data: {
            email: `supplier-recognition-${state.run}@example.invalid`,
            name: "Supplier aging private QA",
          },
        })
        state.actorUserId = user.id
        persist()
        const tenant = await db.tenant.create({
          data: {
            slug: `supplier-recognition-${state.run}`,
            name: "Supplier aging private QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            currencyCode: "NGN",
            timezone: "Africa/Lagos",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        state.tenantId = tenant.id
        persist()
        const actor = { tenantId: tenant.id, actorUserId: user.id }
        const book = await createFinanceBook(db, { ...actor, startsAt })
        state.bookId = book.id
        persist()
        const supplier = await createFinanceSupplier(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `aging-supplier-${state.run}`,
          code: "AGING",
          name: "Private aging supplier",
        })
        return { actor, book, supplier, state }
      }
      try {
        const primaryState = states[0]
        const foreignState = states[1]
        if (!primaryState || !foreignState)
          throw new Error("Missing owned fixture scopes")
        const primary = await createOwned(primaryState)
        const foreign = await createOwned(foreignState)
        const { actor, book, supplier } = primary
        const context = { ...actor, bookId: book.id }
        const bank = await db.financeAccount.findFirstOrThrow({
          where: { bookId: book.id, purpose: "BANK" },
        })
        await recordFinanceMoneyMovement(db, {
          ...context,
          clientCommandId: `aging-bank-${primaryState.run}`,
          kind: "OPENING_BALANCE",
          accountId: bank.id,
          amountMinor: "50000",
          description: "Private QA opening bank",
          effectiveAt: startsAt,
        })
        await recordFinanceSupplierOpening(db, {
          ...context,
          clientCommandId: `aging-payable-${primaryState.run}`,
          supplierId: supplier.id,
          kind: "PAYABLE",
          amountMinor: "500",
          description: "Undated original opening payable",
          effectiveAt: startsAt,
        })
        const advance = await recordFinanceSupplierOpening(db, {
          ...context,
          clientCommandId: `aging-advance-${primaryState.run}`,
          supplierId: supplier.id,
          kind: "ADVANCE",
          amountMinor: "400",
          description: "Separate original opening advance",
          effectiveAt: startsAt,
        })
        const store = await db.store.create({
          data: {
            tenantId: actor.tenantId,
            name: "Private aging QA Store",
            slug: `aging-${primaryState.run}`,
            status: "ACTIVE",
            currencyCode: "NGN",
          },
        })
        const item = await db.catalogItem.create({
          data: {
            tenantId: actor.tenantId,
            slug: `aging-${primaryState.run}`,
            kind: "PRODUCT",
            name: "Private aging planned goods",
            product: { create: {} },
            variants: {
              create: { key: "default", name: "Default", isDefault: true },
            },
          },
          include: { product: true, variants: true },
        })
        primaryState.items.push(item.id)
        persist()
        const product = item.product
        const variant = item.variants[0]
        if (!product || !variant) throw new Error("Missing owned planned goods")
        const configuration = await db.unitConfigurationVersion.create({
          data: {
            productId: product.id,
            version: 1,
            status: "CURRENT",
            canonicalBalanceScale: 18,
            units: {
              create: {
                key: "unit",
                name: "unit",
                factor: "1",
                stockBehavior: "CANONICAL_SHARED",
                transactionScale: 0,
              },
            },
          },
          include: { units: true },
        })
        const unit = configuration.units[0]
        if (!unit) throw new Error("Missing owned unit")
        await db.catalogProduct.update({
          where: { id: product.id },
          data: { currentUnitConfigurationVersionId: configuration.id },
        })
        const balance = await db.stockBalanceSource.create({
          data: {
            tenantId: actor.tenantId,
            storeId: store.id,
            productId: product.id,
            variantId: variant.id,
            inventoryUnitId: unit.id,
            kind: "SHARED_POOL",
          },
        })

        stage = "original invoices and bucket controls"
        persist()
        const invoiceRun = primaryState.run
        const invoiceUnitId = unit.id
        async function invoice(
          label: string,
          amountMinor: string,
          dueAt?: Date,
        ) {
          const recognition = await registerFinancePurchase(db, {
            ...context,
            clientCommandId: `aging-register-${label}-${invoiceRun}`,
            supplierId: supplier.id,
            storeId: store.id,
            description: `Private aging ${label}`,
            agreedAt: date(1),
            lines: [
              {
                balanceSourceId: balance.id,
                enteredInventoryUnitId: invoiceUnitId,
                expectedConfigurationVersionId: configuration.id,
                enteredQuantity: "1",
                amountMinor,
                description: "Private agreed goods",
                categories: [{ name: "Purchase" }],
              },
            ],
          })
          const event = await recognizeFinancePurchase(db, {
            ...context,
            clientCommandId: `aging-invoice-${label}-${invoiceRun}`,
            recognitionId: recognition.id,
            stage: "INVOICE",
            effectiveAt: date(1),
            reference: `AGING-${label}`,
            invoiceAmountMinor: amountMinor,
            dueAt,
          })
          const original =
            await db.financePurchaseRecognitionEvent.findFirstOrThrow({
              where: { id: event.id, bookId: book.id, supplierId: supplier.id },
              select: { invoiceBillId: true },
            })
          if (!original.invoiceBillId)
            throw new Error("Missing original invoice identity")
          return {
            recognitionId: recognition.id,
            eventId: event.id,
            billId: original.invoiceBillId,
          }
        }
        const due = await invoice("due-today", "1000", date(15))
        const overdue = await invoice("overdue", "2000", date(1))
        await invoice("not-due", "3000", new Date("2026-10-01T12:00:00Z"))
        const undated = await invoice("undated", "4000")
        const reportInput = {
          ...context,
          supplierId: supplier.id,
          asOfDate: "2026-09-15",
        }
        const initial = await getFinanceSupplierPayableAging(db, {
          ...reportInput,
          limit: 2,
        })
        expect(initial.payableMinor).toBe("10500")
        expect(initial.advanceMinor).toBe("400")
        expect(initial.outstandingSourceCount).toBe(5)
        expect(initial.sourcesRead).toBe(6)
        expect(initial.buckets).toEqual([
          { bucket: "NOT_DUE", amountMinor: "3000", sourceCount: 1 },
          { bucket: "DUE_TODAY", amountMinor: "1000", sourceCount: 1 },
          { bucket: "OVERDUE_1_30", amountMinor: "2000", sourceCount: 1 },
          { bucket: "OVERDUE_31_60", amountMinor: "0", sourceCount: 0 },
          { bucket: "OVERDUE_61_90", amountMinor: "0", sourceCount: 0 },
          { bucket: "OVERDUE_91_PLUS", amountMinor: "0", sourceCount: 0 },
          { bucket: "UNDATED", amountMinor: "4500", sourceCount: 2 },
        ])
        expect(initial.data[0]?.dueAt).toBeNull()
        expect(initial.nextCursor).not.toBeNull()
        expect(
          (
            await getFinanceSupplierStatement(db, {
              ...context,
              supplierId: supplier.id,
              snapshotSequence: initial.snapshotSequence,
            })
          ).payableMinor,
        ).toBe(initial.payableMinor)
        expect(
          (
            await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: balance.id },
            })
          ).onHandQuantity.toFixed(),
        ).toBe("0")

        stage = "settlement cutoff and old watermark"
        persist()
        const payment = await payFinancePurchaseBill(db, {
          ...context,
          clientCommandId: `aging-cash-${primaryState.run}`,
          billId: due.billId,
          moneyAccountId: bank.id,
          amountMinor: "300",
          effectiveAt: date(16),
        })
        const afterPayment = await getFinanceSupplierPayableAging(db, {
          ...reportInput,
          asOfDate: "2026-09-16",
        })
        expect(afterPayment.payableMinor).toBe("10200")
        expect(afterPayment.advanceMinor).toBe("400")
        await payFinancePurchaseBill(db, {
          ...context,
          clientCommandId: `aging-later-backdated-cash-${primaryState.run}`,
          billId: due.billId,
          moneyAccountId: bank.id,
          amountMinor: "200",
          effectiveAt: date(16),
        })
        expect(
          (
            await getFinanceSupplierPayableAging(db, {
              ...reportInput,
              asOfDate: "2026-09-16",
              snapshotSequence: afterPayment.snapshotSequence,
            })
          ).payableMinor,
        ).toBe("10200")
        expect(
          (
            await getFinanceSupplierPayableAging(db, {
              ...reportInput,
              asOfDate: "2026-09-16",
            })
          ).payableMinor,
        ).toBe("10000")
        const allocation = await allocateFinanceSupplierAdvance(db, {
          ...context,
          clientCommandId: `aging-allocation-${primaryState.run}`,
          billId: overdue.billId,
          advanceEntryId: advance.id,
          amountMinor: "100",
          effectiveAt: date(17),
          description: "Explicit QA advance allocation",
        })
        await releaseFinanceSupplierAllocation(db, {
          ...context,
          clientCommandId: `aging-release-${primaryState.run}`,
          allocationId: allocation.id,
          amountMinor: "40",
          effectiveAt: date(18),
          reason: "Partial QA release",
        })
        await reverseFinancePurchasePayment(db, {
          ...context,
          clientCommandId: `aging-cash-reversal-${primaryState.run}`,
          paymentId: payment.id,
          effectiveAt: date(19),
          reason: "Immutable QA payment reversal",
        })
        await reverseFinancePurchaseRecognition(db, {
          ...context,
          clientCommandId: `aging-invoice-cancellation-${primaryState.run}`,
          recognitionId: undated.recognitionId,
          eventId: undated.eventId,
          effectiveAt: date(20),
          reason: "Immutable QA invoice cancellation",
        })
        const current = await getFinanceSupplierPayableAging(db, {
          ...reportInput,
          asOfDate: "2026-09-20",
        })
        expect(current.payableMinor).toBe("6240")
        expect(current.advanceMinor).toBe("340")
        expect(
          current.buckets.find((bucket) => bucket.bucket === "UNDATED")
            ?.amountMinor,
        ).toBe("500")
        expect(
          current.data.find((row) => row.billId === due.billId)
            ?.outstandingMinor,
        ).toBe("800")
        expect(
          current.data.find((row) => row.billId === overdue.billId)
            ?.outstandingMinor,
        ).toBe("1940")
        expect(current.data.some((row) => row.billId === undated.billId)).toBe(
          false,
        )
        const statement = await getFinanceSupplierStatement(db, {
          ...context,
          supplierId: supplier.id,
          snapshotSequence: current.snapshotSequence,
        })
        expect(statement.payableMinor).toBe(current.payableMinor)
        expect(statement.advanceMinor).toBe(current.advanceMinor)
        const beforeSettlement = await getFinanceSupplierPayableAging(
          db,
          reportInput,
        )
        expect(beforeSettlement.payableMinor).toBe("10500")
        expect(beforeSettlement.advanceMinor).toBe("400")
        expect(beforeSettlement.buckets).toEqual(initial.buckets)
        const old = await getFinanceSupplierPayableAging(db, {
          ...reportInput,
          snapshotSequence: initial.snapshotSequence,
          limit: 2,
        })
        expect(old).toEqual(initial)
        const continuation = await getFinanceSupplierPayableAging(db, {
          ...reportInput,
          snapshotSequence: initial.snapshotSequence,
          cursor: initial.nextCursor ?? undefined,
          limit: 50,
        })
        expect(continuation.payableMinor).toBe(initial.payableMinor)
        expect(continuation.advanceMinor).toBe(initial.advanceMinor)
        expect(continuation.data).toHaveLength(3)
        expect(
          new Set(
            [...old.data, ...continuation.data].map((row) => row.sourceEntryId),
          ).size,
        ).toBe(5)

        stage = "actual scope and permission refusals"
        persist()
        await expect(
          getFinanceSupplierPayableAging(db, {
            ...reportInput,
            bookId: foreign.book.id,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" })
        await expect(
          getFinanceSupplierPayableAging(db, {
            ...reportInput,
            supplierId: foreign.supplier.id,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" })
        await expect(
          getFinanceSupplierPayableAging(db, {
            ...reportInput,
            actorUserId: foreign.actor.actorUserId,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        await expect(
          getFinanceSupplierPayableAging(db, {
            ...reportInput,
            asOfDate: "2026-09-16",
            snapshotSequence: initial.snapshotSequence,
            cursor: initial.nextCursor ?? undefined,
          }),
        ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
        expect(
          (
            await db.membership.updateMany({
              where: {
                tenantId: actor.tenantId,
                userId: actor.actorUserId,
                role: "OWNER",
                status: "ACTIVE",
              },
              data: { role: "MANAGER" },
            })
          ).count,
        ).toBe(1)
        await expect(
          getFinanceSupplierPayableAging(db, reportInput),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        expect(
          (
            await db.membership.updateMany({
              where: {
                tenantId: actor.tenantId,
                userId: actor.actorUserId,
                role: "MANAGER",
                status: "ACTIVE",
              },
              data: { role: "OWNER" },
            })
          ).count,
        ).toBe(1)
        expect(
          (
            await db.tenant.updateMany({
              where: {
                id: actor.tenantId,
                slug: `supplier-recognition-${primaryState.run}`,
                dataClassification: "QA",
                currencyCode: "NGN",
              },
              data: { currencyCode: "USD" },
            })
          ).count,
        ).toBe(1)
        await expect(
          getFinanceSupplierPayableAging(db, reportInput),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(
          (
            await db.tenant.updateMany({
              where: {
                id: actor.tenantId,
                slug: `supplier-recognition-${primaryState.run}`,
                dataClassification: "QA",
                currencyCode: "USD",
              },
              data: { currencyCode: "NGN" },
            })
          ).count,
        ).toBe(1)
        completed = true
        stage = "operating assertions passed"
        persist()
        console.log(
          `supplier-aging ${primaryState.run}: operating assertions passed; cleanup begins`,
        )
      } catch (error) {
        operatingFailure = error
      } finally {
        for (const state of [...states].reverse()) {
          try {
            await cleanupPurchaseRecognitionTest(db, state)
            const checks = await Promise.all([
              state.bookId
                ? db.financeSupplierAccount.count({
                    where: { bookId: state.bookId },
                  })
                : 0,
              state.bookId
                ? db.financeJournalLine.count({
                    where: { bookId: state.bookId },
                  })
                : 0,
              state.bookId
                ? db.financeAccount.count({ where: { bookId: state.bookId } })
                : 0,
              state.bookId
                ? db.financeBillLine.count({ where: { bookId: state.bookId } })
                : 0,
              state.bookId
                ? db.financeBillPayment.count({
                    where: { bookId: state.bookId },
                  })
                : 0,
              state.bookId
                ? db.financeSupplierAllocation.count({
                    where: { bookId: state.bookId },
                  })
                : 0,
              state.bookId
                ? db.financeSupplierAllocationRelease.count({
                    where: { bookId: state.bookId },
                  })
                : 0,
              state.tenantId
                ? db.membership.count({ where: { tenantId: state.tenantId } })
                : 0,
              state.tenantId
                ? db.store.count({ where: { tenantId: state.tenantId } })
                : 0,
            ])
            expect(checks).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
            cleanup.push({
              run: state.run,
              outcome: "guarded helper cleanup clear",
              extraChecks: checks.length,
            })
            persist()
            console.log(
              `supplier-aging ${state.run}: 9 additional exact cleanup checks clear`,
            )
          } catch (error) {
            cleanup.push({
              run: state.run,
              outcome: "cleanup failed; exact retained scope needs recovery",
            })
            persist()
            cleanupFailures.push(error)
          }
        }
        stage = cleanupFailures.length
          ? "cleanup failure; owned scope retained"
          : "cleanup terminal"
        persist()
      }
      const failures = [
        ...(operatingFailure ? [operatingFailure] : []),
        ...cleanupFailures,
      ]
      if (failures.length)
        throw new AggregateError(
          failures,
          "Supplier aging acceptance or cleanup failed; retained errors and run manifest identify the exact scope.",
        )
    }, 900_000)
  },
)
