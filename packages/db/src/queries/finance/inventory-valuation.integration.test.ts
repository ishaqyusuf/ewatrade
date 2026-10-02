import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { postSingleBalanceStockOperation } from "../inventory-operations"
import { createFinanceBook } from "./accounts"
import { getFinancePurchaseBill } from "./purchase-reads"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const RECEIPT_DATE = new Date("2026-09-15T12:00:00.000Z")
setDefaultTimeout(300_000)

type PurchaseBalance = {
  balanceSourceId: string
  enteredInventoryUnitId: string
  expectedConfigurationVersionId: string
}

function assertCleanup(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function firstLineId(detail: { lines: Array<{ id: string }> }): string {
  const line = detail.lines[0]
  if (!line) throw new Error("Purchase detail is missing its expected line")
  return line.id
}

describeWithServiceCommerceDatabase(
  "purchase receipt inventory valuation acceptance",
  () => {
    test("prices known receipts, preserves unknown cost coverage, and rolls back atomically", async () => {
      const { prisma: db } = await import("../../client")
      const suffix = randomUUID()
      const email = `inventory-valuation-${suffix}@example.invalid`
      const tenantSlug = `inventory-valuation-${suffix}`
      const foreignTenantSlug = `${tenantSlug}-foreign`
      const tenantIds: string[] = []
      const storeIds: string[] = []
      const catalogItemIds: string[] = []
      const balanceSourceIds: string[] = []
      let actorUserId: string | undefined
      let bookId: string | undefined
      let supplierId: string | undefined

      try {
        const user = await db.user.create({
          data: { email, name: "Inventory valuation acceptance" },
        })
        actorUserId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug: tenantSlug,
            name: "Inventory valuation acceptance",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(tenant.id)
        const actor = { tenantId: tenant.id, actorUserId: user.id }
        const foreignTenant = await db.tenant.create({
          data: {
            slug: foreignTenantSlug,
            name: "Foreign valuation acceptance business",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(foreignTenant.id)
        const foreignActor = {
          tenantId: foreignTenant.id,
          actorUserId: user.id,
        }
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            slug: `valuation-${suffix}`,
            name: "Private valuation acceptance store",
            status: "ACTIVE",
          },
        })
        storeIds.push(store.id)

        async function createBalance(
          label: string,
          initialQuantity: string,
          packaged = false,
        ): Promise<PurchaseBalance> {
          const item = await db.catalogItem.create({
            data: {
              tenantId: tenant.id,
              slug: `valuation-${suffix}-${label}`,
              kind: "PRODUCT",
              name: `Private valuation ${label}`,
              product: { create: {} },
              variants: {
                create: { key: "default", name: "Default", isDefault: true },
              },
            },
            include: { product: true, variants: true },
          })
          catalogItemIds.push(item.id)
          const product = item.product
          const variant = item.variants[0]
          if (!product || !variant) {
            throw new Error("Incomplete private valuation product fixture")
          }
          const configuration = await db.unitConfigurationVersion.create({
            data: {
              productId: product.id,
              version: 1,
              status: "CURRENT",
              canonicalBalanceScale: 18,
              units: {
                create: [
                  {
                    key: "unit",
                    name: "unit",
                    factor: "1",
                    stockBehavior: "CANONICAL_SHARED",
                    transactionScale: 3,
                  },
                  ...(packaged
                    ? [
                        {
                          key: "case",
                          name: "case",
                          factor: "12",
                          stockBehavior: "PACKAGED_STOCK" as const,
                          transactionScale: 3,
                        },
                      ]
                    : []),
                ],
              },
            },
            include: { units: true },
          })
          const unit = configuration.units.find(
            (candidate) => candidate.key === (packaged ? "case" : "unit"),
          )
          if (!unit) throw new Error("Missing selected valuation unit")
          const canonical = configuration.units.filter(
            (candidate) => candidate.stockBehavior === "CANONICAL_SHARED",
          )
          expect(canonical).toHaveLength(1)
          expect(canonical[0]?.factor.toFixed()).toBe("1")
          await db.catalogProduct.update({
            where: { id: product.id },
            data: { currentUnitConfigurationVersionId: configuration.id },
          })
          const balance = await db.stockBalanceSource.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              productId: product.id,
              variantId: variant.id,
              inventoryUnitId: unit.id,
              kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
              onHandQuantity: initialQuantity,
            },
          })
          balanceSourceIds.push(balance.id)
          return {
            balanceSourceId: balance.id,
            enteredInventoryUnitId: unit.id,
            expectedConfigurationVersionId: configuration.id,
          }
        }

        const knownBalance = await createBalance("known", "0")
        const unknownOpeningBalance = await createBalance(
          "opening-unknown",
          "5",
        )
        const missedMovementBalance = await createBalance(
          "missed-movement",
          "0",
          true,
        )
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: BOOK_START,
        })
        bookId = book.id
        const account = await db.financeAccount.findUnique({
          where: { bookId_code: { bookId: book.id, code: "1300" } },
        })
        const payable = await db.financeAccount.findUnique({
          where: { bookId_code: { bookId: book.id, code: "2000" } },
        })
        if (!account || !payable) {
          throw new Error("Missing valuation acceptance control accounts")
        }
        const supplier = await createFinanceSupplier(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `valuation-supplier-${suffix}`,
          code: `VAL-${suffix.slice(0, 8)}`,
          name: "Valuation acceptance supplier",
        })
        supplierId = supplier.id

        const makePurchase = (input: {
          clientCommandId: string
          balance: PurchaseBalance
          description: string
          amountMinor: string
          enteredQuantity: string
          expectedBalanceRevision: number
          linePositionLabel: string
          effectiveAt?: Date
        }) => ({
          ...actor,
          bookId: book.id,
          clientCommandId: input.clientCommandId,
          supplierId: supplier.id,
          storeId: store.id,
          description: input.description,
          incurredAt: input.effectiveAt ?? RECEIPT_DATE,
          lines: [
            {
              ...input.balance,
              description: input.description,
              amountMinor: input.amountMinor,
              enteredQuantity: input.enteredQuantity,
              expectedBalanceRevision: input.expectedBalanceRevision,
              categories: [{ name: `Valuation ${input.linePositionLabel}` }],
            },
          ],
        })

        const captureState = async () => {
          const rows = await db.$queryRaw<
            Array<{
              lastSequence: string
              bills: string
              billLines: string
              supplierEntries: string
              commands: string
              journals: string
              journalLines: string
              receipts: string
              stockOperations: string
              stockMovements: string
              stockCategories: string
              categoryNames: string
              valuationPools: string
              valuationEvents: string
              poolState: Array<{
                id: string
                balanceSourceId: string
                quantity: string
                valueMinor: string | null
                unknownReason: string | null
                lastStockRevision: number
                lastMovementCount: string
                lastSequence: string
                latestEffectiveAt: string
              }>
              balanceState: Array<{
                id: string
                quantity: string
                revision: number
              }>
            }>
          >`
          SELECT
            b."lastSequence"::text AS "lastSequence",
            (SELECT COUNT(*)::text FROM "FinanceBill" WHERE "bookId" = b.id) AS bills,
            (SELECT COUNT(*)::text FROM "FinanceBillLine" WHERE "bookId" = b.id) AS "billLines",
            (SELECT COUNT(*)::text FROM "FinanceSupplierEntry" WHERE "bookId" = b.id) AS "supplierEntries",
            (SELECT COUNT(*)::text FROM "FinanceCommand" WHERE "bookId" = b.id) AS commands,
            (SELECT COUNT(*)::text FROM "FinanceJournalEntry" WHERE "bookId" = b.id) AS journals,
            (SELECT COUNT(*)::text FROM "FinanceJournalLine" WHERE "bookId" = b.id) AS "journalLines",
            (SELECT COUNT(*)::text FROM "FinancePurchaseReceiptLine" WHERE "bookId" = b.id) AS receipts,
            (SELECT COUNT(*)::text FROM "StockOperation" WHERE "tenantId" = ${tenant.id}) AS "stockOperations",
            (SELECT COUNT(*)::text FROM "StockMovement" m JOIN "StockOperation" o ON o.id = m."operationId" WHERE o."tenantId" = ${tenant.id}) AS "stockMovements",
            (SELECT COUNT(*)::text FROM "StockOperationCategory" WHERE "tenantId" = ${tenant.id}) AS "stockCategories",
            (SELECT COUNT(*)::text FROM "StockOperationCategoryName" WHERE "tenantId" = ${tenant.id}) AS "categoryNames",
            (SELECT COUNT(*)::text FROM "FinanceInventoryPool" WHERE "bookId" = b.id) AS "valuationPools",
            (SELECT COUNT(*)::text FROM "FinanceInventoryValuationEvent" WHERE "bookId" = b.id) AS "valuationEvents",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', p.id,
                'balanceSourceId', p."balanceSourceId",
                'quantity', p.quantity::text,
                'valueMinor', p."valueMinor"::text,
                'unknownReason', p."unknownReason"::text,
                'lastStockRevision', p."lastStockRevision",
                'lastMovementCount', p."lastMovementCount"::text,
                'lastSequence', p."lastSequence"::text,
                'latestEffectiveAt', p."latestEffectiveAt"
              ) ORDER BY p.id)
              FROM "FinanceInventoryPool" p WHERE p."bookId" = b.id
            ), '[]'::jsonb) AS "poolState",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', s.id,
                'quantity', s."onHandQuantity"::text,
                'revision', s.revision
              ) ORDER BY s.id)
              FROM "StockBalanceSource" s
              WHERE s.id IN (${knownBalance.balanceSourceId}, ${unknownOpeningBalance.balanceSourceId}, ${missedMovementBalance.balanceSourceId})
            ), '[]'::jsonb) AS "balanceState"
          FROM "FinanceBook" b
          WHERE b.id = ${book.id}
        `
          const row = rows[0]
          if (!row) throw new Error("Valuation acceptance book disappeared")
          return row
        }

        const initialState = await captureState()
        const failedPurchaseId = `late-failure-${suffix}`
        await expect(
          recordFinancePurchase(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: failedPurchaseId,
            supplierId: supplier.id,
            storeId: store.id,
            description: "Late stock failure should roll everything back",
            incurredAt: RECEIPT_DATE,
            lines: [
              {
                ...knownBalance,
                description: "First line should be rolled back",
                amountMinor: "101",
                enteredQuantity: "2",
                expectedBalanceRevision: 0,
                categories: [{ name: `Rollback ${suffix.slice(0, 8)}` }],
              },
              {
                ...unknownOpeningBalance,
                description: "Second line has a stale stock revision",
                amountMinor: "7",
                enteredQuantity: "1",
                expectedBalanceRevision: 1,
                categories: [{ name: `Rollback ${suffix.slice(0, 8)}` }],
              },
            ],
          }),
        ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
        expect(await captureState()).toEqual(initialState)

        const firstPurchaseInput = makePurchase({
          clientCommandId: failedPurchaseId,
          balance: knownBalance,
          description: "First known receipt",
          amountMinor: "101",
          enteredQuantity: "2",
          expectedBalanceRevision: 0,
          linePositionLabel: `first-${suffix.slice(0, 8)}`,
        })
        const firstPurchase = await recordFinancePurchase(
          db,
          firstPurchaseInput,
        )
        const firstDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: firstPurchase.id,
        })
        expect(firstDetail.lines).toHaveLength(1)
        expect(firstDetail.coverage).toEqual({
          receipts: "LINKED_MOVEMENT_PER_LINE",
          valuation: "PURCHASE_RECEIPTS_ONLY",
          cogs: "NOT_IMPLEMENTED",
        })
        expect(firstDetail.lines[0]?.receipt?.valuation).toMatchObject({
          status: "KNOWN",
          quantityBefore: "0",
          quantityAfter: "2",
          valueBeforeMinor: "0",
          valueAfterMinor: "101",
          sourceCostMinor: "101",
          unknownReason: null,
        })
        const firstReceipt =
          await db.financePurchaseReceiptLine.findFirstOrThrow({
            where: { bookId: book.id, billLineId: firstLineId(firstDetail) },
            include: { stockMovement: true },
          })
        expect(firstDetail.lines[0]?.receipt?.id).toBe(firstReceipt.id)
        const firstEvent =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { purchaseReceiptId: firstReceipt.id },
          })
        const firstPool = await db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: knownBalance.balanceSourceId,
            },
          },
        })
        expect(firstPool.quantity.toString()).toBe("2")
        expect(firstPool.valueMinor).toBe(BigInt(101))
        expect(firstPool.unknownReason).toBeNull()
        expect(firstPool.lastStockRevision).toBe(1)
        expect(firstPool.lastMovementCount).toBe(BigInt(1))
        expect(firstEvent.kind).toBe("PURCHASE_RECEIPT")
        expect(firstEvent.canonicalEffect.toString()).toBe("2")
        expect(firstEvent.quantityBefore.toString()).toBe("0")
        expect(firstEvent.quantityAfter.toString()).toBe("2")
        expect(firstEvent.sourceCostMinor).toBe(BigInt(101))
        expect(firstEvent.valueAfterMinor).toBe(BigInt(101))

        const beforeReplay = await captureState()
        expect(await recordFinancePurchase(db, firstPurchaseInput)).toEqual(
          firstPurchase,
        )
        expect(await captureState()).toEqual(beforeReplay)

        const secondPurchase = await recordFinancePurchase(
          db,
          makePurchase({
            clientCommandId: `second-known-${suffix}`,
            balance: knownBalance,
            description: "Second known receipt",
            amountMinor: "100",
            enteredQuantity: "1",
            expectedBalanceRevision: 1,
            effectiveAt: new Date("2026-09-17T12:00:00.000Z"),
            linePositionLabel: `second-${suffix.slice(0, 8)}`,
          }),
        )
        const secondDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: secondPurchase.id,
        })
        const secondReceipt =
          await db.financePurchaseReceiptLine.findFirstOrThrow({
            where: { bookId: book.id, billLineId: firstLineId(secondDetail) },
            include: { stockMovement: true },
          })
        const secondEvent =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { purchaseReceiptId: secondReceipt.id },
          })
        const knownPoolAfterSecond =
          await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: knownBalance.balanceSourceId,
              },
            },
          })
        expect(knownPoolAfterSecond.quantity.toString()).toBe("3")
        expect(knownPoolAfterSecond.valueMinor).toBe(BigInt(201))
        expect(knownPoolAfterSecond.lastMovementCount).toBe(BigInt(2))
        expect(knownPoolAfterSecond.unknownReason).toBeNull()
        expect(secondEvent.quantityBefore.toString()).toBe("2")
        expect(secondEvent.quantityAfter.toString()).toBe("3")
        expect(secondEvent.valueBeforeMinor).toBe(BigInt(101))
        expect(secondEvent.valueDeltaMinor).toBe(BigInt(100))
        expect(secondEvent.valueAfterMinor).toBe(BigInt(201))
        expect(secondEvent.sourceCostMinor).toBe(BigInt(100))
        expect(
          await db.financeInventoryValuationEvent.findUniqueOrThrow({
            where: { id: firstEvent.id },
          }),
        ).toEqual(firstEvent)

        const beforeBackdatedReceipt = await captureState()
        await expect(
          recordFinancePurchase(
            db,
            makePurchase({
              clientCommandId: `backdated-receipt-${suffix}`,
              balance: knownBalance,
              description: "Receipt before the pool latest effective date",
              amountMinor: "50",
              enteredQuantity: "1",
              expectedBalanceRevision: 2,
              effectiveAt: new Date("2026-09-16T12:00:00.000Z"),
              linePositionLabel: `backdated-${suffix.slice(0, 8)}`,
            }),
          ),
        ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
        expect(await captureState()).toEqual(beforeBackdatedReceipt)

        const unknownPurchase = await recordFinancePurchase(
          db,
          makePurchase({
            clientCommandId: `opening-unknown-${suffix}`,
            balance: unknownOpeningBalance,
            description: "Receipt into historical unvalued stock",
            amountMinor: "101",
            enteredQuantity: "2",
            expectedBalanceRevision: 0,
            linePositionLabel: `unknown-${suffix.slice(0, 8)}`,
          }),
        )
        const unknownDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: unknownPurchase.id,
        })
        const unknownReceipt =
          await db.financePurchaseReceiptLine.findFirstOrThrow({
            where: { bookId: book.id, billLineId: firstLineId(unknownDetail) },
          })
        const unknownEvent =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { purchaseReceiptId: unknownReceipt.id },
          })
        expect(unknownDetail.coverage).toEqual({
          receipts: "LINKED_MOVEMENT_PER_LINE",
          valuation: "PURCHASE_RECEIPTS_ONLY",
          cogs: "NOT_IMPLEMENTED",
        })
        expect(unknownDetail.lines[0]?.receipt?.valuation).toMatchObject({
          status: "UNKNOWN",
          quantityBefore: "5",
          quantityAfter: "7",
          valueBeforeMinor: null,
          valueAfterMinor: null,
          sourceCostMinor: "101",
          unknownReason: "MISSING_OPENING_COST",
        })
        const unknownPool = await db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: unknownOpeningBalance.balanceSourceId,
            },
          },
        })
        expect(unknownPool.quantity.toString()).toBe("7")
        expect(unknownPool.valueMinor).toBeNull()
        expect(unknownPool.unknownReason).toBe("MISSING_OPENING_COST")
        expect(unknownPool.lastStockRevision).toBe(1)
        expect(unknownEvent.sourceCostMinor).toBe(BigInt(101))
        expect(unknownEvent.valueAfterMinor).toBeNull()
        expect(unknownEvent.unknownReason).toBe("MISSING_OPENING_COST")

        const firstMovementPurchase = await recordFinancePurchase(
          db,
          makePurchase({
            clientCommandId: `before-missed-movement-${suffix}`,
            balance: missedMovementBalance,
            description: "Known receipt before unrecorded movement",
            amountMinor: "101",
            enteredQuantity: "2",
            expectedBalanceRevision: 0,
            linePositionLabel: `movement-first-${suffix.slice(0, 8)}`,
          }),
        )
        const firstMovementDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: firstMovementPurchase.id,
        })
        const firstMovementReceipt =
          await db.financePurchaseReceiptLine.findFirstOrThrow({
            where: {
              bookId: book.id,
              billLineId: firstLineId(firstMovementDetail),
            },
          })
        const knownEventBeforeGap =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { purchaseReceiptId: firstMovementReceipt.id },
          })
        expect(knownEventBeforeGap.canonicalEffect.toString()).toBe("24")
        expect(knownEventBeforeGap.quantityBefore.toString()).toBe("0")
        expect(knownEventBeforeGap.quantityAfter.toString()).toBe("24")
        // Simulate a reservation metadata revision: this does not represent a
        // complete reservation workflow and intentionally creates no movement.
        await db.stockBalanceSource.update({
          where: { id: missedMovementBalance.balanceSourceId },
          data: { revision: { increment: 1 } },
        })
        const afterRevisionOnlyChange =
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: missedMovementBalance.balanceSourceId },
          })
        expect(afterRevisionOnlyChange.onHandQuantity.toString()).toBe("2")
        expect(afterRevisionOnlyChange.revision).toBe(2)
        const eventsBeforeRevisionOnlyPurchase =
          await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          })
        const revisionOnlyPurchase = await recordFinancePurchase(
          db,
          makePurchase({
            clientCommandId: `revision-only-${suffix}`,
            balance: missedMovementBalance,
            description: "Receipt after revision-only reservation metadata",
            amountMinor: "100",
            enteredQuantity: "1",
            expectedBalanceRevision: 2,
            effectiveAt: new Date("2026-09-16T12:00:00.000Z"),
            linePositionLabel: `revision-only-${suffix.slice(0, 8)}`,
          }),
        )
        const revisionOnlyDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: revisionOnlyPurchase.id,
        })
        const revisionOnlyReceipt =
          await db.financePurchaseReceiptLine.findFirstOrThrow({
            where: {
              bookId: book.id,
              billLineId: firstLineId(revisionOnlyDetail),
            },
          })
        const revisionOnlyEvent =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { purchaseReceiptId: revisionOnlyReceipt.id },
          })
        const poolAfterRevisionOnlyChange =
          await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: missedMovementBalance.balanceSourceId,
              },
            },
          })
        expect(revisionOnlyEvent.valueAfterMinor).toBe(BigInt(201))
        expect(revisionOnlyEvent.unknownReason).toBeNull()
        expect(poolAfterRevisionOnlyChange.quantity.toString()).toBe("36")
        expect(poolAfterRevisionOnlyChange.valueMinor).toBe(BigInt(201))
        expect(poolAfterRevisionOnlyChange.unknownReason).toBeNull()
        expect(poolAfterRevisionOnlyChange.lastMovementCount).toBe(BigInt(2))
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          }),
        ).toBe(eventsBeforeRevisionOnlyPurchase + 1)
        await postSingleBalanceStockOperation(db, {
          actorUserId: user.id,
          balanceSourceId: missedMovementBalance.balanceSourceId,
          clientOperationId: `ordinary-stock-${suffix}`,
          direction: "increase",
          effectiveAt: new Date("2026-09-17T12:00:00.000Z"),
          enteredInventoryUnitId: missedMovementBalance.enteredInventoryUnitId,
          enteredQuantity: "1.5",
          expectedBalanceRevision: 3,
          expectedConfigurationVersionId:
            missedMovementBalance.expectedConfigurationVersionId,
          categories: [{ name: `Ordinary movement ${suffix.slice(0, 8)}` }],
          reason: "Ordinary inventory receipt outside finance valuation",
          schemaVersion: 1,
          source: "inventory_valuation_acceptance",
          storeId: store.id,
          tenantId: tenant.id,
          type: "receipt",
        })
        const afterOrdinaryMovement =
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: missedMovementBalance.balanceSourceId },
          })
        expect(afterOrdinaryMovement.onHandQuantity.toString()).toBe("4.5")
        await postSingleBalanceStockOperation(db, {
          actorUserId: user.id,
          balanceSourceId: missedMovementBalance.balanceSourceId,
          clientOperationId: `ordinary-net-zero-${suffix}`,
          direction: "decrease",
          effectiveAt: new Date("2026-09-17T12:00:00.000Z"),
          enteredInventoryUnitId: missedMovementBalance.enteredInventoryUnitId,
          enteredQuantity: "1.5",
          expectedBalanceRevision: 4,
          expectedConfigurationVersionId:
            missedMovementBalance.expectedConfigurationVersionId,
          categories: [{ name: `Ordinary movement ${suffix.slice(0, 8)}` }],
          reason:
            "Uncosted movement restores quantity but not valuation coverage",
          schemaVersion: 1,
          source: "inventory_valuation_acceptance",
          storeId: store.id,
          tenantId: tenant.id,
          type: "adjustment",
        })
        expect(
          (
            await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: missedMovementBalance.balanceSourceId },
            })
          ).onHandQuantity.toString(),
        ).toBe("3")
        const eventsBeforeUncapturedPurchase =
          await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          })
        const nextMovementPurchase = await recordFinancePurchase(
          db,
          makePurchase({
            clientCommandId: `after-missed-movement-${suffix}`,
            balance: missedMovementBalance,
            description: "Receipt after uncaptured movement",
            amountMinor: "100",
            enteredQuantity: "1",
            expectedBalanceRevision: 5,
            effectiveAt: new Date("2026-09-18T12:00:00.000Z"),
            linePositionLabel: `movement-second-${suffix.slice(0, 8)}`,
          }),
        )
        const nextMovementDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: nextMovementPurchase.id,
        })
        const nextMovementReceipt =
          await db.financePurchaseReceiptLine.findFirstOrThrow({
            where: {
              bookId: book.id,
              billLineId: firstLineId(nextMovementDetail),
            },
          })
        const gapEvent =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { purchaseReceiptId: nextMovementReceipt.id },
          })
        const poolAfterGap = await db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: missedMovementBalance.balanceSourceId,
            },
          },
        })
        expect(poolAfterGap.quantity.toString()).toBe("48")
        expect(poolAfterGap.lastMovementCount).toBe(BigInt(5))
        expect(poolAfterGap.valueMinor).toBeNull()
        expect(poolAfterGap.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
        expect(gapEvent.sourceCostMinor).toBe(BigInt(100))
        expect(gapEvent.valueAfterMinor).toBeNull()
        expect(gapEvent.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          }),
        ).toBe(eventsBeforeUncapturedPurchase + 1)
        expect(
          await db.financeInventoryValuationEvent.findUniqueOrThrow({
            where: { id: knownEventBeforeGap.id },
          }),
        ).toEqual(knownEventBeforeGap)

        const beforeScopeDenial = await captureState()
        await expect(
          recordFinancePurchase(db, {
            ...makePurchase({
              clientCommandId: `foreign-scope-receipt-${suffix}`,
              balance: knownBalance,
              description: "Foreign tenant cannot replay a local purchase",
              amountMinor: "100",
              enteredQuantity: "1",
              expectedBalanceRevision: 2,
              linePositionLabel: `foreign-${suffix.slice(0, 8)}`,
            }),
            ...foreignActor,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" })
        expect(await captureState()).toEqual(beforeScopeDenial)

        const firstReceiptForFkProbe =
          await db.financePurchaseReceiptLine.findFirstOrThrow({
            where: { bookId: book.id, billLine: { billId: firstPurchase.id } },
          })
        const secondReceiptForFkProbe =
          await db.financePurchaseReceiptLine.findFirstOrThrow({
            where: { bookId: book.id, billLine: { billId: secondPurchase.id } },
          })
        const firstEventForFkProbe =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { purchaseReceiptId: firstReceiptForFkProbe.id },
          })
        const beforeFkProbe = await captureState()
        await expect(
          db.$transaction(
            async (tx) => {
              await tx.financeInventoryValuationEvent.update({
                where: { id: firstEventForFkProbe.id },
                data: {
                  stockOperationId: secondReceiptForFkProbe.stockOperationId,
                },
              })
              throw new Error(
                "Mismatched receipt provenance FK unexpectedly accepted",
              )
            },
            { maxWait: 10_000, timeout: 30_000 },
          ),
        ).rejects.toMatchObject({ code: "P2003" })
        expect(await captureState()).toEqual(beforeFkProbe)

        const bills = await db.financeBill.findMany({
          where: { bookId: book.id, kind: "PURCHASE" },
          include: {
            supplierEntries: {
              include: { journalEntry: { include: { lines: true } } },
            },
          },
        })
        expect(bills).toHaveLength(6)
        for (const bill of bills) {
          expect(bill.supplierEntries).toHaveLength(1)
          const journal = bill.supplierEntries[0]?.journalEntry
          expect(journal?.lines).toHaveLength(2)
          expect(
            journal?.lines.filter(
              (line) =>
                line.accountId === account.id &&
                line.debitMinor === bill.totalMinor &&
                line.creditMinor === BigInt(0),
            ),
          ).toHaveLength(1)
          expect(
            journal?.lines.filter(
              (line) =>
                line.accountId === payable.id &&
                line.creditMinor === bill.totalMinor &&
                line.debitMinor === BigInt(0),
            ),
          ).toHaveLength(1)
        }
        expect(
          await db.financeInventoryPool.count({ where: { bookId: book.id } }),
        ).toBe(3)
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          }),
        ).toBe(6)
      } finally {
        await db.$transaction(
          async (tx) => {
            if (bookId) {
              await tx.financeInventoryValuationEvent.deleteMany({
                where: { bookId },
              })
              await tx.financeInventoryPool.deleteMany({ where: { bookId } })
              await tx.financePurchaseReceiptLine.deleteMany({
                where: { bookId },
              })
              await tx.financeSupplierEntry.deleteMany({ where: { bookId } })
              await tx.financeBillPayment.deleteMany({ where: { bookId } })
              await tx.financeBillLine.deleteMany({ where: { bookId } })
              await tx.financeBill.deleteMany({ where: { bookId } })
            }
            if (tenantIds.length) {
              await tx.stockMovement.deleteMany({
                where: { operation: { tenantId: { in: tenantIds } } },
              })
              await tx.stockOperationCategory.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockOperation.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockBalanceSource.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockOperationCategoryName.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
            }
            if (bookId) {
              await tx.financeSupplierAccount.deleteMany({ where: { bookId } })
              await tx.financeJournalLine.deleteMany({ where: { bookId } })
              await tx.financeJournalEntry.deleteMany({ where: { bookId } })
              await tx.financeCommand.deleteMany({ where: { bookId } })
              await tx.financeAccount.deleteMany({ where: { bookId } })
              await tx.financeBook.deleteMany({ where: { id: bookId } })
            }
            if (catalogItemIds.length) {
              await tx.catalogItem.deleteMany({
                where: { id: { in: catalogItemIds } },
              })
            }
            if (storeIds.length) {
              await tx.store.deleteMany({ where: { id: { in: storeIds } } })
            }
            if (tenantIds.length) {
              await tx.membership.deleteMany({
                where: { tenantId: { in: tenantIds }, userId: actorUserId },
              })
              await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
            }
            if (actorUserId) {
              await tx.user.deleteMany({ where: { id: actorUserId } })
            }
          },
          { maxWait: 10_000, timeout: 30_000 },
        )

        const [
          remainingTenants,
          remainingStores,
          remainingItems,
          remainingBooks,
          remainingSuppliers,
          remainingUsers,
          remainingPools,
          remainingEvents,
          remainingReceipts,
          remainingBills,
          remainingStockOperations,
          remainingStockMovements,
        ] = await Promise.all([
          db.tenant.count({ where: { id: { in: tenantIds } } }),
          db.store.count({ where: { id: { in: storeIds } } }),
          db.catalogItem.count({ where: { id: { in: catalogItemIds } } }),
          bookId
            ? db.financeBook.count({ where: { id: bookId } })
            : Promise.resolve(0),
          supplierId
            ? db.financeSupplierAccount.count({ where: { id: supplierId } })
            : Promise.resolve(0),
          actorUserId
            ? db.user.count({ where: { id: actorUserId } })
            : Promise.resolve(0),
          bookId
            ? db.financeInventoryPool.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeInventoryValuationEvent.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financePurchaseReceiptLine.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeBill.count({ where: { bookId } })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockOperation.count({
                where: { tenantId: { in: tenantIds } },
              })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockMovement.count({
                where: { operation: { tenantId: { in: tenantIds } } },
              })
            : Promise.resolve(0),
        ])
        assertCleanup(
          [
            remainingTenants,
            remainingStores,
            remainingItems,
            remainingBooks,
            remainingSuppliers,
            remainingUsers,
            remainingPools,
            remainingEvents,
            remainingReceipts,
            remainingBills,
            remainingStockOperations,
            remainingStockMovements,
          ].every((count) => count === 0),
          `Inventory valuation acceptance fixture ${suffix} remains after cleanup.`,
        )
      }
    }, 300_000)
  },
)
