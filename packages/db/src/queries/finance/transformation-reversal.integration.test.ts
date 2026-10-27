import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  postSingleBalanceStockOperation,
  transformPackagedStock,
} from "../inventory-operations"
import { reverseStockTransformation } from "../inventory-transformation-reversals"
import { createFinanceBook } from "./accounts"
import { getFinancePurchaseBill } from "./purchase-reads"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"
import { PACKAGED_TRANSFORMATION_RESTORATION_SOURCE } from "./valuation-transformation-reversals"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const RECEIPT_DATE = new Date("2026-09-15T12:00:00.000Z")
setDefaultTimeout(480_000)

describeWithServiceCommerceDatabase(
  "packaged transformation restoration acceptance",
  () => {
    test("reverses a transformation at its exact original quantities and values", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const tenantIds: string[] = []
      const storeIds: string[] = []
      const catalogItemIds: string[] = []
      const operationIds: string[] = []
      let actorUserId: string | undefined
      let bookId: string | undefined

      try {
        const user = await db.user.create({
          data: {
            email: `transformation-reversal-${runId}@example.invalid`,
            name: "Transformation reversal QA",
          },
        })
        actorUserId = user.id
        const tenant = await db.tenant.create({
          data: {
            name: "Transformation reversal QA",
            slug: `transformation-reversal-${runId}`,
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
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Private transformation reversal QA store",
            slug: `transformation-reversal-${runId}`,
            status: "ACTIVE",
          },
        })
        storeIds.push(store.id)
        const item = await db.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: `transformation-reversal-${runId}`,
            kind: "PRODUCT",
            name: "Transformation reversal QA Product",
            product: { create: {} },
            variants: {
              create: [
                { key: "default", name: "Default", isDefault: true },
                { key: "short", name: "Short target QA" },
                { key: "unknown", name: "Unknown target QA" },
              ],
            },
          },
          include: { product: true, variants: true },
        })
        catalogItemIds.push(item.id)
        const product = item.product
        const variantId = (key: string) => {
          const found = item.variants.find((entry) => entry.key === key)
          if (!found) throw new Error(`Missing ${key} variant`)
          return found.id
        }
        if (!product) throw new Error("Missing Catalog Product")
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
                {
                  key: "half-case",
                  name: "half case",
                  factor: "6",
                  stockBehavior: "PACKAGED_STOCK",
                  transactionScale: 3,
                },
                {
                  key: "case",
                  name: "case",
                  factor: "12",
                  stockBehavior: "PACKAGED_STOCK",
                  transactionScale: 3,
                },
              ],
            },
          },
          include: { units: true },
        })
        const halfCase = configuration.units.find((u) => u.key === "half-case")
        const caseUnit = configuration.units.find((u) => u.key === "case")
        if (!halfCase || !caseUnit) throw new Error("Missing packaged units")
        await db.catalogProduct.update({
          where: { id: product.id },
          data: { currentUnitConfigurationVersionId: configuration.id },
        })
        const balance = async (unitId: string, key: string) =>
          (
            await db.stockBalanceSource.create({
              data: {
                tenantId: tenant.id,
                storeId: store.id,
                productId: product.id,
                variantId: variantId(key),
                inventoryUnitId: unitId,
                kind: "PACKAGED_STOCK",
                onHandQuantity: "0",
              },
            })
          ).id
        const source = await balance(caseUnit.id, "default")
        const target = await balance(halfCase.id, "default")
        const shortSource = await balance(caseUnit.id, "short")
        const shortTarget = await balance(halfCase.id, "short")
        const unknownSource = await balance(caseUnit.id, "unknown")
        const unknownTarget = await balance(halfCase.id, "unknown")
        const unitOf = (id: string) =>
          [source, shortSource, unknownSource].includes(id)
            ? caseUnit.id
            : halfCase.id

        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: BOOK_START,
        })
        bookId = book.id
        const supplier = await createFinanceSupplier(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `transformation-reversal-supplier-${runId}`,
          code: `TRV-${runId.slice(0, 8)}`,
          name: "Transformation reversal QA supplier",
        })

        const revision = async (id: string) =>
          (await db.stockBalanceSource.findUniqueOrThrow({ where: { id } }))
            .revision
        async function receive(id: string, quantity: string, amount: string) {
          const bill = await recordFinancePurchase(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `transformation-reversal-${id}-${runId}`,
            supplierId: supplier.id,
            storeId: store.id,
            description: "Known packaged receipt",
            incurredAt: RECEIPT_DATE,
            lines: [
              {
                balanceSourceId: id,
                enteredInventoryUnitId: unitOf(id),
                expectedConfigurationVersionId: configuration.id,
                description: `${quantity} QA packages with known cost`,
                amountMinor: amount,
                enteredQuantity: quantity,
                expectedBalanceRevision: await revision(id),
                categories: [{ name: `TRV ${runId.slice(0, 8)}` }],
              },
            ],
          })
          const detail = await getFinancePurchaseBill(db, {
            ...actor,
            bookId: book.id,
            billId: bill.id,
          })
          if (!detail.lines[0]?.receipt) throw new Error("Missing receipt")
        }
        async function ordinary(
          id: string,
          label: string,
          type: "receipt" | "adjustment",
          direction: "increase" | "decrease",
          quantity: string,
        ) {
          const operation = await postSingleBalanceStockOperation(db, {
            ...actor,
            balanceSourceId: id,
            clientOperationId: `transformation-reversal-${label}-${runId}`,
            direction,
            enteredInventoryUnitId: unitOf(id),
            enteredQuantity: quantity,
            expectedBalanceRevision: await revision(id),
            expectedConfigurationVersionId: configuration.id,
            reason: `QA ${label}`,
            schemaVersion: 1,
            source: "inventory",
            storeId: store.id,
            type,
          })
          operationIds.push(operation.id)
        }
        async function transform(
          label: string,
          from: string,
          to: string,
          sourceQuantity: string,
          targetQuantity: string,
        ) {
          const operation = await transformPackagedStock(db, {
            ...actor,
            clientOperationId: `transformation-reversal-${label}-${runId}`,
            expectedConfigurationVersionId: configuration.id,
            reason: `QA ${label}`,
            schemaVersion: 1,
            source: "inventory",
            sourceBalanceRevision: await revision(from),
            sourceBalanceSourceId: from,
            sourceQuantity,
            storeId: store.id,
            targetBalanceRevision: await revision(to),
            targetBalanceSourceId: to,
            targetQuantity,
          })
          operationIds.push(operation.id)
          return operation
        }
        const reverseInput = async (
          label: string,
          operationId: string,
          from: string,
          to: string,
        ) => ({
          ...actor,
          clientOperationId: `transformation-reversal-${label}-${runId}`,
          expectedSourceBalanceRevision: await revision(from),
          expectedTargetBalanceRevision: await revision(to),
          operationId,
          reason: `QA ${label}`,
          schemaVersion: 1,
          source: "inventory",
        })
        const state = async (ids: string[]) => ({
          balances: await Promise.all(
            ids.map(async (id) => {
              const row = await db.stockBalanceSource.findUniqueOrThrow({
                where: { id },
              })
              return {
                onHand: row.onHandQuantity.toFixed(),
                revision: row.revision,
              }
            }),
          ),
          pools: await Promise.all(
            ids.map(async (id) => {
              const row = await db.financeInventoryPool.findUnique({
                where: {
                  bookId_balanceSourceId: {
                    bookId: book.id,
                    balanceSourceId: id,
                  },
                },
              })
              return row
                ? {
                    quantity: row.quantity.toFixed(),
                    valueMinor: row.valueMinor,
                    unknownReason: row.unknownReason,
                    lastSequence: row.lastSequence,
                  }
                : null
            }),
          ),
          operations: await db.stockOperation.count({
            where: { tenantId: tenant.id },
          }),
          events: await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          }),
        })

        // Known pair: source 3 cases worth 5, target 1 half case worth 7.
        await receive(source, "3", "5")
        await receive(target, "1", "7")
        const before = await state([source, target])
        expect(before.pools.map((pool) => pool?.valueMinor)).toEqual([
          BigInt(5),
          BigInt(7),
        ])
        const forward = await transform("known", source, target, "1.5", "3")
        const forwardEvents = await db.financeInventoryValuationEvent.findMany({
          where: { stockOperationId: forward.id },
        })
        const forwardOut = forwardEvents.find((e) => e.kind === "TRANSFER_OUT")
        const forwardIn = forwardEvents.find((e) => e.kind === "TRANSFER_IN")
        if (!forwardOut?.valueDeltaMinor || !forwardIn?.valueDeltaMinor)
          throw new Error("Forward transformation is missing known values")
        expect(forwardIn.valueDeltaMinor).toBe(-forwardOut.valueDeltaMinor)

        // Stale revision is refused before any write.
        const stale = await reverseInput("stale", forward.id, source, target)
        await expect(
          reverseStockTransformation(db, {
            ...stale,
            expectedTargetBalanceRevision:
              stale.expectedTargetBalanceRevision - 1,
          }),
        ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })

        const command = await reverseInput("undo", forward.id, source, target)
        const reversal = await reverseStockTransformation(db, command)
        operationIds.push(reversal.id)
        expect(reversal.type).toBe("TRANSFORMATION")
        expect(reversal.correctionOfOperationId).toBe(forward.id)
        expect(reversal.movements).toHaveLength(2)

        // Both balances and both pools return exactly to their prior state.
        const after = await state([source, target])
        expect(after.balances.map((row) => row.onHand)).toEqual(
          before.balances.map((row) => row.onHand),
        )
        expect(after.balances.map((row) => row.revision)).toEqual(
          before.balances.map((row) => row.revision + 2),
        )
        expect(
          after.pools.map((pool) => [pool?.quantity, pool?.valueMinor]),
        ).toEqual(
          before.pools.map((pool) => [pool?.quantity, pool?.valueMinor]),
        )
        expect(after.pools.map((pool) => pool?.unknownReason)).toEqual([
          null,
          null,
        ])

        const movements = await db.stockMovement.findMany({
          where: { operationId: reversal.id },
          include: { valuationEvent: true, reversalOfMovement: true },
        })
        const backOut = movements.find((m) => m.balanceSourceId === target)
        const backIn = movements.find((m) => m.balanceSourceId === source)
        if (!backOut || !backIn) throw new Error("Missing reversal movements")
        expect(backOut.reversalOfMovement?.operationId).toBe(forward.id)
        expect(backOut.reversalOfMovement?.balanceSourceId).toBe(target)
        expect(backIn.reversalOfMovement?.balanceSourceId).toBe(source)
        expect(backOut.enteredQuantity.toFixed()).toBe("3")
        expect(backIn.enteredQuantity.toFixed()).toBe("1.5")
        expect(backOut.signedCanonicalEffect.toFixed()).toBe("-18")
        expect(backIn.signedCanonicalEffect.toFixed()).toBe("18")
        expect(backOut.valuationEvent).toMatchObject({
          kind: "TRANSFER_OUT",
          sourceKind: PACKAGED_TRANSFORMATION_RESTORATION_SOURCE,
          sourceId: reversal.id,
          valueDeltaMinor: -forwardIn.valueDeltaMinor,
          sourceCostMinor: forwardOut.sourceCostMinor,
          unknownReason: null,
        })
        expect(backIn.valuationEvent).toMatchObject({
          kind: "TRANSFER_IN",
          sourceKind: PACKAGED_TRANSFORMATION_RESTORATION_SOURCE,
          sourceId: reversal.id,
          valueDeltaMinor: -forwardOut.valueDeltaMinor,
          sourceCostMinor: forwardOut.sourceCostMinor,
          unknownReason: null,
        })
        expect(
          await db.financeJournalEntry.count({
            where: {
              bookId: book.id,
              sourceId: { in: [forward.id, reversal.id] },
            },
          }),
        ).toBe(0)

        // Replay returns the original result without writing.
        const settled = await state([source, target])
        expect(await reverseStockTransformation(db, command)).toEqual(reversal)
        expect(await state([source, target])).toEqual(settled)
        await expect(
          reverseStockTransformation(db, {
            ...command,
            reason: "Different reason",
          }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
        await expect(
          reverseStockTransformation(
            db,
            await reverseInput("twice", forward.id, source, target),
          ),
        ).rejects.toMatchObject({
          code: "INVALID_STOCK_OPERATION",
          message:
            "This transformation has already been reversed or corrected.",
        })
        await expect(
          reverseStockTransformation(
            db,
            await reverseInput("reverse-reversal", reversal.id, source, target),
          ),
        ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
        const receiptOperation = await db.stockOperation.findFirstOrThrow({
          where: { tenantId: tenant.id, type: { not: "TRANSFORMATION" } },
        })
        await expect(
          reverseStockTransformation(db, {
            ...(await reverseInput(
              "not-transform",
              forward.id,
              source,
              target,
            )),
            operationId: receiptOperation.id,
          }),
        ).rejects.toMatchObject({
          code: "INVALID_STOCK_OPERATION",
          message: "Only a packaged stock transformation can be reversed here.",
        })
        expect(await state([source, target])).toEqual(settled)

        // Target no longer holds the moved quantity.
        await receive(shortSource, "1", "12")
        const short = await transform(
          "short",
          shortSource,
          shortTarget,
          "1",
          "2",
        )
        await ordinary(shortTarget, "short-loss", "adjustment", "decrease", "1")
        const shortBefore = await state([shortSource, shortTarget])
        await expect(
          reverseStockTransformation(
            db,
            await reverseInput(
              "short-undo",
              short.id,
              shortSource,
              shortTarget,
            ),
          ),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" })
        expect(await state([shortSource, shortTarget])).toEqual(shortBefore)

        // Target pool became UNKNOWN after a known transformation.
        await receive(unknownSource, "1", "12")
        const unknown = await transform(
          "unknown",
          unknownSource,
          unknownTarget,
          "1",
          "2",
        )
        await ordinary(unknownTarget, "uncosted-in", "receipt", "increase", "1")
        const unknownBefore = await state([unknownSource, unknownTarget])
        expect(unknownBefore.pools[1]?.valueMinor).toBeNull()
        await expect(
          reverseStockTransformation(
            db,
            await reverseInput(
              "unknown-undo",
              unknown.id,
              unknownSource,
              unknownTarget,
            ),
          ),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: expect.stringContaining("UNKNOWN"),
        })
        expect(await state([unknownSource, unknownTarget])).toEqual(
          unknownBefore,
        )
      } finally {
        const cleanupBookId = bookId
        await db.$transaction(
          async (tx) => {
            if (cleanupBookId) {
              await tx.financeInventoryValuationEvent.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeInventoryPool.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financePurchaseReceiptLine.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeSupplierEntry.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeBillPayment.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeBillLine.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeBill.deleteMany({
                where: { bookId: cleanupBookId },
              })
            }
            if (tenantIds.length) {
              await tx.stockMovement.updateMany({
                where: {
                  operation: { tenantId: { in: tenantIds } },
                  reversalOfMovementId: { not: null },
                },
                data: { reversalOfMovementId: null },
              })
              await tx.stockMovement.deleteMany({
                where: { operation: { tenantId: { in: tenantIds } } },
              })
              await tx.stockOperationCategory.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockOperation.deleteMany({
                where: {
                  tenantId: { in: tenantIds },
                  correctionOfOperationId: { not: null },
                },
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
            if (cleanupBookId) {
              await tx.financeSupplierAccount.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeJournalLine.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeJournalEntry.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeCommand.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeAccount.deleteMany({
                where: { bookId: cleanupBookId },
              })
              await tx.financeBook.deleteMany({ where: { id: cleanupBookId } })
            }
            if (catalogItemIds.length)
              await tx.catalogItem.deleteMany({
                where: { id: { in: catalogItemIds } },
              })
            if (storeIds.length)
              await tx.store.deleteMany({ where: { id: { in: storeIds } } })
            if (tenantIds.length && actorUserId)
              await tx.membership.deleteMany({
                where: { tenantId: { in: tenantIds }, userId: actorUserId },
              })
            if (tenantIds.length)
              await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
            if (actorUserId)
              await tx.user.deleteMany({ where: { id: actorUserId } })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
        const remaining = await Promise.all([
          db.tenant.count({ where: { id: { in: tenantIds } } }),
          db.store.count({ where: { id: { in: storeIds } } }),
          db.catalogItem.count({ where: { id: { in: catalogItemIds } } }),
          bookId ? db.financeBook.count({ where: { id: bookId } }) : 0,
          bookId
            ? db.financeInventoryValuationEvent.count({ where: { bookId } })
            : 0,
          bookId ? db.financeInventoryPool.count({ where: { bookId } }) : 0,
          db.stockOperation.count({ where: { id: { in: operationIds } } }),
          db.stockOperation.count({ where: { tenantId: { in: tenantIds } } }),
          db.stockMovement.count({
            where: { operation: { tenantId: { in: tenantIds } } },
          }),
          db.stockBalanceSource.count({
            where: { tenantId: { in: tenantIds } },
          }),
          actorUserId ? db.user.count({ where: { id: actorUserId } }) : 0,
        ])
        expect(remaining).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      }
    })
  },
)
