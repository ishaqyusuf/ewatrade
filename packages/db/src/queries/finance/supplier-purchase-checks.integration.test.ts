import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { recordFinanceMoneyMovement } from "./money"
import { verifyPurchasePaymentReversalRollback } from "./purchase-payment-reversal.integration-check"
import { verifyPurchaseReceiptReview } from "./purchase-receipt-review.integration-check"
import {
  recognizeFinancePurchase,
  registerFinancePurchase,
} from "./purchase-recognition"
import { verifyPurchaseRecognitionReversalRollback } from "./purchase-recognition-reversal.integration-check"
import { cleanupPurchaseRecognitionTest } from "./purchase-recognition-test-cleanup"
import {
  verifyDirectPurchaseRecordingRollback,
  verifyDirectPurchaseReviewRefusals,
} from "./purchase-recording.integration-check"
import {
  allocateFinanceSupplierAdvance,
  payFinancePurchaseBill,
} from "./purchase-settlements"
import { recordFinancePurchase } from "./purchases"
import { verifySupplierAllocationReleaseRollback } from "./supplier-allocation-release.integration-check"
import { verifySupplierEntryReversalRollback } from "./supplier-entry-reversal.integration-check"
import { verifySupplierOpeningRollback } from "./supplier-opening.integration-check"
import { verifySupplierSettlementRollback } from "./supplier-settlement.integration-check"
import {
  createFinanceSupplier,
  recordFinanceSupplierAdvance,
  recordFinanceSupplierOpening,
} from "./supplier-writes"

const start = new Date("2026-01-01T00:00:00Z")
const date = (day: number) =>
  new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`)

// Runs the supplier and purchase *.integration-check.ts rollback helpers that
// no other test imports (posting matrix "Gaps found"). Each helper verifies its
// command, replay and review inside a transaction it rolls back, then checks
// every saved fact is unchanged. The fixture follows
// purchase-recognition.integration.test.ts and shares its guarded cleanup.
describeWithServiceCommerceDatabase(
  "supplier and purchase rollback checks",
  () => {
    test("opening, entry reversal, settlement, allocation release, payment reversal, recognition reversal, receipt review and direct recording roll back exactly", async () => {
      const { prisma: db } = await import("../../client")
      const run = randomUUID()
      let tenantId: string | undefined
      let actorUserId: string | undefined
      let bookId: string | undefined
      const items: string[] = []
      try {
        const user = await db.user.create({
          data: {
            email: `supplier-recognition-${run}@example.invalid`,
            name: "Supplier rollback checks QA",
          },
        })
        actorUserId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug: `supplier-recognition-${run}`,
            name: "Supplier rollback checks QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const actor = { tenantId: tenant.id, actorUserId: user.id }
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Rollback checks store",
            slug: `rollback-checks-${run}`,
            status: "ACTIVE",
          },
        })
        const book = await createFinanceBook(db, { ...actor, startsAt: start })
        bookId = book.id
        const context = { ...actor, bookId: book.id }
        const bank = await db.financeAccount.findFirstOrThrow({
          where: { bookId: book.id, purpose: "BANK" },
        })
        await recordFinanceMoneyMovement(db, {
          ...context,
          clientCommandId: `bank-${run}`,
          kind: "OPENING_BALANCE",
          accountId: bank.id,
          amountMinor: "100000",
          description: "Opening bank",
          effectiveAt: start,
        })
        const supplier = await createFinanceSupplier(db, {
          ...context,
          clientCommandId: `supplier-${run}`,
          code: "CHECKS",
          name: "Rollback checks supplier",
        })

        async function balance(label: string) {
          const item = await db.catalogItem.create({
            data: {
              tenantId: tenant.id,
              slug: `rollback-checks-${run}-${label}`,
              kind: "PRODUCT",
              name: `Rollback checks ${label}`,
              product: { create: {} },
              variants: {
                create: { key: "default", name: "Default", isDefault: true },
              },
            },
            include: { product: true, variants: true },
          })
          items.push(item.id)
          const variant = item.variants[0]
          if (!item.product || !variant)
            throw new Error("Missing QA product graph")
          const config = await db.unitConfigurationVersion.create({
            data: {
              productId: item.product.id,
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
          const unit = config.units[0]
          if (!unit) throw new Error("Missing QA unit")
          await db.catalogProduct.update({
            where: { id: item.product.id },
            data: { currentUnitConfigurationVersionId: config.id },
          })
          const source = await db.stockBalanceSource.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              productId: item.product.id,
              variantId: variant.id,
              inventoryUnitId: unit.id,
              kind: "SHARED_POOL",
            },
          })
          return {
            balanceSourceId: source.id,
            enteredInventoryUnitId: unit.id,
            expectedConfigurationVersionId: config.id,
          }
        }
        const goods = await balance("goods")
        const other = await balance("other")
        const direct = await balance("direct")

        // supplier-opening: a new supplier and its opening, both kinds.
        for (const kind of ["PAYABLE", "ADVANCE"] as const) {
          const result = await verifySupplierOpeningRollback(db, {
            ...context,
            kind,
            amountMinor: "1500",
            clientCommandId: `opening-check-${kind}-${run}`,
          })
          expect(result).toMatchObject({ kind, rollbackVerified: true })
        }

        // supplier-entry-reversal: opening payable, opening advance, advance.
        const openingPayable = await recordFinanceSupplierOpening(db, {
          ...context,
          supplierId: supplier.id,
          clientCommandId: `opening-payable-${run}`,
          kind: "PAYABLE",
          amountMinor: "900",
          description: "Owed at cutoff",
          effectiveAt: start,
        })
        const openingAdvance = await recordFinanceSupplierOpening(db, {
          ...context,
          supplierId: supplier.id,
          clientCommandId: `opening-advance-${run}`,
          kind: "ADVANCE",
          amountMinor: "600",
          description: "Prepaid at cutoff",
          effectiveAt: start,
        })
        const advance = await recordFinanceSupplierAdvance(db, {
          ...context,
          supplierId: supplier.id,
          clientCommandId: `advance-${run}`,
          moneyAccountId: bank.id,
          amountMinor: "3000",
          description: "Supplier prepayment",
          effectiveAt: date(1),
        })
        for (const [label, entryId] of [
          ["opening-payable", openingPayable.id],
          ["opening-advance", openingAdvance.id],
          ["advance", advance.id],
        ] as const) {
          const result = await verifySupplierEntryReversalRollback(db, {
            ...context,
            clientCommandId: `reverse-check-${label}-${run}`,
            entryId,
            reason: "QA rollback check",
            effectiveAt: date(2),
          })
          expect(result).toMatchObject({
            verified: true,
            savedFactsUnchanged: true,
          })
        }

        // A staged purchase with a recognised invoice (1100 owed).
        const registered = await registerFinancePurchase(db, {
          ...context,
          clientCommandId: `register-${run}`,
          supplierId: supplier.id,
          storeId: store.id,
          description: "Staged purchase",
          agreedAt: date(1),
          lines: [
            {
              ...goods,
              enteredQuantity: "2",
              amountMinor: "1000",
              description: "Agreed goods",
              categories: [{ name: "Purchase" }],
            },
            {
              ...other,
              enteredQuantity: "1",
              amountMinor: "100",
              description: "Other goods",
              categories: [{ name: "Purchase" }],
            },
          ],
        })
        await recognizeFinancePurchase(db, {
          ...context,
          recognitionId: registered.id,
          clientCommandId: `invoice-${run}`,
          stage: "INVOICE",
          effectiveAt: date(2),
          reference: "Supplier invoice",
          invoiceAmountMinor: "1100",
        })
        const invoice =
          await db.financePurchaseRecognitionEvent.findFirstOrThrow({
            where: {
              bookId: book.id,
              recognitionId: registered.id,
              stage: "INVOICE",
            },
          })
        if (!invoice.invoiceBillId) throw new Error("Missing invoice bill")
        const billId = invoice.invoiceBillId

        // purchase-recognition-reversal: the unpaid invoice fact.
        expect(
          await verifyPurchaseRecognitionReversalRollback(db, {
            ...context,
            clientCommandId: `invoice-reversal-check-${run}`,
            recognitionId: registered.id,
            eventId: invoice.id,
            reason: "QA rollback check",
            effectiveAt: date(3),
          }),
        ).toMatchObject({ verified: true, savedFactsUnchanged: true })

        // purchase-receipt-review: canonical and reviewed receipt commands.
        for (const mode of ["canonical", "reviewed"] as const) {
          const result = await verifyPurchaseReceiptReview(
            db,
            {
              ...context,
              recognitionId: registered.id,
              effectiveAt: date(3),
              reference: "Goods received",
              clientCommandId: `receipt-check-${mode}-${run}`,
            },
            mode,
          )
          expect(result).toMatchObject({ mode, rollbackVerified: true })
        }

        // supplier-settlement: advance, allocation and payment, all rolled back.
        const settlement = await verifySupplierSettlementRollback(db, {
          ...context,
          supplierId: supplier.id,
          billId,
          moneyAccountId: bank.id,
          effectiveAt: date(4),
        })
        expect(settlement.rollbackVerified).toBe(true)
        expect(settlement.results.map((row) => row.kind)).toEqual([
          "advance",
          "allocation",
          "payment",
        ])

        // purchase-payment-reversal on a real payment.
        const payment = await payFinancePurchaseBill(db, {
          ...context,
          clientCommandId: `pay-${run}`,
          billId,
          moneyAccountId: bank.id,
          amountMinor: "300",
          effectiveAt: date(5),
        })
        expect(
          await verifyPurchasePaymentReversalRollback(db, {
            ...context,
            clientCommandId: `pay-reversal-check-${run}`,
            paymentId: payment.id,
            reason: "QA rollback check",
            effectiveAt: date(6),
          }),
        ).toMatchObject({ verified: true, savedFactsUnchanged: true })

        // supplier-allocation-release on a real allocation.
        const allocation = await allocateFinanceSupplierAdvance(db, {
          ...context,
          clientCommandId: `allocate-${run}`,
          billId,
          advanceEntryId: advance.id,
          amountMinor: "400",
          effectiveAt: date(5),
          description: "Apply prepayment",
        })
        expect(
          await verifySupplierAllocationReleaseRollback(db, {
            ...context,
            clientCommandId: `release-check-${run}`,
            allocationId: allocation.id,
            amountMinor: "150",
            reason: "QA rollback check",
            effectiveAt: date(6),
          }),
        ).toMatchObject({ verified: true, savedFactsUnchanged: true })

        // purchase-recording: a first real receipt gives the line a cost pool,
        // then the reviewed direct purchase and its stale-source refusals.
        await recordFinancePurchase(db, {
          ...context,
          clientCommandId: `direct-first-${run}`,
          supplierId: supplier.id,
          storeId: store.id,
          description: "First direct purchase",
          incurredAt: date(7),
          lines: [
            {
              ...direct,
              expectedBalanceRevision: 0,
              enteredQuantity: "3",
              amountMinor: "600",
              description: "Received goods",
              categories: [{ name: "Restock" }],
            },
          ],
        })
        const revision = (
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: direct.balanceSourceId },
          })
        ).revision
        const purchase = {
          ...context,
          supplierId: supplier.id,
          storeId: store.id,
          description: "Reviewed direct purchase",
          reference: "Delivery note",
          incurredAt: date(8),
          lines: [
            {
              ...direct,
              expectedBalanceRevision: revision,
              enteredQuantity: "2",
              amountMinor: "500",
              description: "Second delivery",
              categories: Array.from({ length: 10 }, (_, index) => ({
                name: `Check ${run.slice(0, 8)} ${index}`,
              })),
            },
          ],
        }
        const recording = await verifyDirectPurchaseRecordingRollback(
          db,
          purchase,
          `direct-check-${run}`,
        )
        expect(recording).toMatchObject({
          completed: true,
          rollbackVerified: true,
          failure: undefined,
        })
        const refusals = await verifyDirectPurchaseReviewRefusals(db, purchase)
        expect(refusals.rollbackVerified).toBe(true)
        expect(refusals.results.map((row) => row.refused)).toEqual([
          true,
          true,
          true,
          true,
        ])
      } finally {
        await cleanupPurchaseRecognitionTest(db, {
          run,
          tenantId,
          actorUserId,
          bookId,
          items,
        })
      }
    }, 900_000)
  },
)
