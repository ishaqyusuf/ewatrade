import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { transformPackagedStock } from "../inventory-operations"
import { createFinanceBook } from "./accounts"
import { getFinancePurchaseBill } from "./purchase-reads"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const RECEIPT_DATE = new Date("2026-09-15T12:00:00.000Z")
setDefaultTimeout(480_000)

type Balance = {
  balanceSourceId: string
  enteredInventoryUnitId: string
  expectedConfigurationVersionId: string
  inventoryUnitId: string
  kind: "PACKAGED_STOCK"
}

type Receipt = {
  billId: string
  eventId: string
  movementId: string
  operationId: string
  receiptId: string
}

describeWithServiceCommerceDatabase(
  "packaged transformation carrying cost acceptance",
  () => {
    test("conserves known cost and retains explicit UNKNOWN through transformation", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const tenantIds: string[] = []
      const storeIds: string[] = []
      const catalogItemIds: string[] = []
      const balanceSourceIds: string[] = []
      const billIds: string[] = []
      const receiptIds: string[] = []
      const receiptEventIds: string[] = []
      const receiptMovementIds: string[] = []
      const receiptOperationIds: string[] = []
      const transformOperationIds: string[] = []
      const transformEventIds: string[] = []
      const transformMovementIds: string[] = []
      const poolIds: string[] = []
      let actorUserId: string | undefined
      let bookId: string | undefined
      let supplierId: string | undefined

      try {
        const user = await db.user.create({
          data: {
            email: `transformation-cost-${runId}@example.invalid`,
            name: "Transformation cost QA",
          },
        })
        actorUserId = user.id
        const tenant = await db.tenant.create({
          data: {
            name: "Transformation cost QA",
            slug: `transformation-cost-${runId}`,
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
            name: "Foreign transformation cost QA",
            slug: `transformation-cost-foreign-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(foreignTenant.id)

        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Private transformation cost QA store",
            slug: `transformation-cost-${runId}`,
            status: "ACTIVE",
          },
        })
        storeIds.push(store.id)

        const item = await db.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: `transformation-cost-${runId}`,
            kind: "PRODUCT",
            name: "Packaged transformation QA Product",
            product: { create: {} },
            variants: {
              create: [
                { key: "default", name: "Default", isDefault: true },
                { key: "unknown-source", name: "Unknown source QA" },
                { key: "unknown-target", name: "Unknown target QA" },
              ],
            },
          },
          include: { product: true, variants: true },
        })
        catalogItemIds.push(item.id)
        const product = item.product
        const variant = item.variants.find((entry) => entry.key === "default")
        const unknownSourceVariant = item.variants.find(
          (entry) => entry.key === "unknown-source",
        )
        const unknownTargetVariant = item.variants.find(
          (entry) => entry.key === "unknown-target",
        )
        if (
          !product ||
          !variant ||
          !unknownSourceVariant ||
          !unknownTargetVariant
        ) {
          throw new Error("Incomplete packaged transformation Catalog fixture")
        }
        const productId = product.id
        const defaultVariantId = variant.id
        const unknownSourceVariantId = unknownSourceVariant.id
        const unknownTargetVariantId = unknownTargetVariant.id
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
        const canonicalUnit = configuration.units.find(
          (unit) => unit.key === "unit",
        )
        const halfCaseUnit = configuration.units.find(
          (unit) => unit.key === "half-case",
        )
        const caseUnit = configuration.units.find((unit) => unit.key === "case")
        if (!canonicalUnit || !halfCaseUnit || !caseUnit) {
          throw new Error("Missing compatible transformation units")
        }
        expect(canonicalUnit.factor.toFixed()).toBe("1")
        expect(halfCaseUnit.factor.toFixed()).toBe("6")
        expect(caseUnit.factor.toFixed()).toBe("12")
        await db.catalogProduct.update({
          where: { id: product.id },
          data: { currentUnitConfigurationVersionId: configuration.id },
        })

        async function makeBalance(
          unit: (typeof configuration.units)[number],
          openingQuantity: string,
          variantId = defaultVariantId,
        ): Promise<Balance> {
          const created = await db.stockBalanceSource.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              productId,
              variantId,
              inventoryUnitId: unit.id,
              kind: "PACKAGED_STOCK",
              onHandQuantity: openingQuantity,
            },
          })
          balanceSourceIds.push(created.id)
          return {
            balanceSourceId: created.id,
            enteredInventoryUnitId: unit.id,
            expectedConfigurationVersionId: configuration.id,
            inventoryUnitId: unit.id,
            kind: "PACKAGED_STOCK",
          }
        }

        const source = await makeBalance(caseUnit, "0")
        const target = await makeBalance(halfCaseUnit, "0")
        const unknownSource = await makeBalance(
          caseUnit,
          "2",
          unknownSourceVariantId,
        )
        const knownTargetForUnknown = await makeBalance(
          halfCaseUnit,
          "0",
          unknownSourceVariantId,
        )
        const knownSourceForUnknown = await makeBalance(
          caseUnit,
          "0",
          unknownTargetVariantId,
        )
        const unknownTarget = await makeBalance(
          halfCaseUnit,
          "1",
          unknownTargetVariantId,
        )

        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: BOOK_START,
        })
        bookId = book.id
        const supplier = await createFinanceSupplier(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `transformation-cost-supplier-${runId}`,
          code: `TRF-${runId.slice(0, 8)}`,
          name: "Transformation cost QA supplier",
        })
        supplierId = supplier.id

        async function receive(input: {
          label: string
          balance: Balance
          quantity: string
          amountMinor: string
          expectedBalanceRevision: number
          incurredAt?: Date
        }): Promise<Receipt> {
          const bill = await recordFinancePurchase(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `transformation-cost-${input.label}-${runId}`,
            supplierId: supplier.id,
            storeId: store.id,
            description: `Known packaged ${input.label} receipt`,
            incurredAt: input.incurredAt ?? RECEIPT_DATE,
            lines: [
              {
                balanceSourceId: input.balance.balanceSourceId,
                enteredInventoryUnitId: input.balance.enteredInventoryUnitId,
                expectedConfigurationVersionId:
                  input.balance.expectedConfigurationVersionId,
                description: `${input.quantity} QA packages with known cost`,
                amountMinor: input.amountMinor,
                enteredQuantity: input.quantity,
                expectedBalanceRevision: input.expectedBalanceRevision,
                categories: [{ name: `TRF ${runId.slice(0, 8)}` }],
              },
            ],
          })
          billIds.push(bill.id)
          const detail = await getFinancePurchaseBill(db, {
            ...actor,
            bookId: book.id,
            billId: bill.id,
          })
          const billLine = detail.lines[0]
          if (!billLine?.receipt) {
            throw new Error(`Missing ${input.label} valuation receipt`)
          }
          const receipt = await db.financePurchaseReceiptLine.findUniqueOrThrow(
            {
              where: { id: billLine.receipt.id },
              include: { stockMovement: true },
            },
          )
          const event =
            await db.financeInventoryValuationEvent.findUniqueOrThrow({
              where: { purchaseReceiptId: receipt.id },
            })
          receiptIds.push(receipt.id)
          receiptEventIds.push(event.id)
          receiptMovementIds.push(receipt.stockMovementId)
          receiptOperationIds.push(receipt.stockOperationId)
          return {
            billId: bill.id,
            eventId: event.id,
            movementId: receipt.stockMovementId,
            operationId: receipt.stockOperationId,
            receiptId: receipt.id,
          }
        }

        const pool = (balance: Balance) =>
          db.financeInventoryPool.findUnique({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: balance.balanceSourceId,
              },
            },
          })
        const requiredPool = async (balance: Balance) => {
          const found = await pool(balance)
          if (!found) throw new Error("Expected transformation valuation pool")
          if (!poolIds.includes(found.id)) poolIds.push(found.id)
          return found
        }
        const balanceState = async (balances: Balance[]) =>
          Promise.all(
            balances.map(async (entry) => {
              const row = await db.stockBalanceSource.findUniqueOrThrow({
                where: { id: entry.balanceSourceId },
              })
              return {
                id: row.id,
                onHandQuantity: row.onHandQuantity.toFixed(),
                revision: row.revision,
              }
            }),
          )
        const valuationEvents = (balances: Balance[]) =>
          db.financeInventoryValuationEvent.findMany({
            where: {
              bookId: book.id,
              balanceSourceId: {
                in: balances.map((entry) => entry.balanceSourceId),
              },
            },
            orderBy: [{ balanceSourceId: "asc" }, { sequence: "asc" }],
          })
        const poolState = async (balances: Balance[]) =>
          Promise.all(
            balances.map(async (entry) => {
              const row = await pool(entry)
              if (row && !poolIds.includes(row.id)) poolIds.push(row.id)
              return row
                ? {
                    id: row.id,
                    balanceSourceId: row.balanceSourceId,
                    quantity: row.quantity.toFixed(),
                    valueMinor: row.valueMinor,
                    unknownReason: row.unknownReason,
                    lastStockRevision: row.lastStockRevision,
                    lastMovementCount: row.lastMovementCount,
                    lastSequence: row.lastSequence,
                    latestEffectiveAt: row.latestEffectiveAt,
                  }
                : null
            }),
          )

        const transformInput = async (input: {
          label: string
          sourceBalance: Balance
          targetBalance: Balance
          sourceQuantity: string
          targetQuantity: string
          tenantId?: string
        }) => {
          const [sourceBalance, targetBalance] = await Promise.all([
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: input.sourceBalance.balanceSourceId },
            }),
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: input.targetBalance.balanceSourceId },
            }),
          ])
          return {
            actorUserId: user.id,
            clientOperationId: `transformation-cost-${input.label}-${runId}`,
            expectedConfigurationVersionId: configuration.id,
            reason: `QA ${input.label} packaged transformation`,
            schemaVersion: 1,
            source: "inventory",
            sourceBalanceRevision: sourceBalance.revision,
            sourceBalanceSourceId: input.sourceBalance.balanceSourceId,
            sourceQuantity: input.sourceQuantity,
            storeId: store.id,
            targetBalanceRevision: targetBalance.revision,
            targetBalanceSourceId: input.targetBalance.balanceSourceId,
            targetQuantity: input.targetQuantity,
            tenantId: input.tenantId ?? tenant.id,
          }
        }
        async function transform(input: {
          label: string
          sourceBalance: Balance
          targetBalance: Balance
          sourceQuantity: string
          targetQuantity: string
          tenantId?: string
        }) {
          const command = await transformInput(input)
          const operation = await transformPackagedStock(db, command)
          transformOperationIds.push(operation.id)
          const movements = await db.stockMovement.findMany({
            where: { operationId: operation.id },
            select: { id: true },
          })
          transformMovementIds.push(...movements.map(({ id }) => id))
          const events = await db.financeInventoryValuationEvent.findMany({
            where: { stockOperationId: operation.id },
          })
          transformEventIds.push(...events.map(({ id }) => id))
          return { command, operation }
        }
        async function eventPair(operationId: string) {
          const rows = await db.financeInventoryValuationEvent.findMany({
            where: { stockOperationId: operationId },
            include: { stockMovement: true },
          })
          expect(rows).toHaveLength(2)
          const sourceEvent = rows.find((row) => row.kind === "TRANSFER_OUT")
          const targetEvent = rows.find((row) => row.kind === "TRANSFER_IN")
          if (!sourceEvent || !targetEvent) {
            throw new Error("Transformation did not register its paired events")
          }
          return { sourceEvent, targetEvent }
        }

        // Initial source carries five minor units across 36 canonical units.
        // Target already has known inventory worth seven minor units.
        await receive({
          label: "main-source-opening",
          balance: source,
          quantity: "3",
          amountMinor: "5",
          expectedBalanceRevision: 0,
        })
        await receive({
          label: "main-target-opening",
          balance: target,
          quantity: "1",
          amountMinor: "7",
          expectedBalanceRevision: 0,
        })
        const initialSourcePool = await requiredPool(source)
        const initialTargetPool = await requiredPool(target)
        expect(initialSourcePool.quantity.toFixed()).toBe("36")
        expect(initialSourcePool.valueMinor).toBe(BigInt(5))
        expect(initialTargetPool.quantity.toFixed()).toBe("6")
        expect(initialTargetPool.valueMinor).toBe(BigInt(7))

        const first = await transform({
          label: "known-partial-one",
          sourceBalance: source,
          targetBalance: target,
          sourceQuantity: "1.5",
          targetQuantity: "3",
        })
        const firstPair = await eventPair(first.operation.id)
        expect(first.operation.type).toBe("TRANSFORMATION")
        expect(firstPair.sourceEvent.sourceKind).toBe("PACKAGED_TRANSFORMATION")
        expect(firstPair.sourceEvent.sourceId).toBe(first.operation.id)
        expect(firstPair.sourceEvent.kind).toBe("TRANSFER_OUT")
        expect(firstPair.sourceEvent.canonicalEffect.toFixed()).toBe("-18")
        expect(firstPair.sourceEvent.quantityBefore.toFixed()).toBe("36")
        expect(firstPair.sourceEvent.quantityAfter.toFixed()).toBe("18")
        expect(firstPair.sourceEvent.valueBeforeMinor).toBe(BigInt(5))
        expect(firstPair.sourceEvent.sourceCostMinor).toBe(BigInt(2))
        expect(firstPair.sourceEvent.valueDeltaMinor).toBe(BigInt(-2))
        expect(firstPair.sourceEvent.valueAfterMinor).toBe(BigInt(3))
        expect(firstPair.targetEvent.sourceId).toBe(first.operation.id)
        expect(firstPair.targetEvent.kind).toBe("TRANSFER_IN")
        expect(firstPair.targetEvent.canonicalEffect.toFixed()).toBe("18")
        expect(firstPair.targetEvent.quantityBefore.toFixed()).toBe("6")
        expect(firstPair.targetEvent.quantityAfter.toFixed()).toBe("24")
        expect(firstPair.targetEvent.valueBeforeMinor).toBe(BigInt(7))
        expect(firstPair.targetEvent.sourceCostMinor).toBe(BigInt(2))
        expect(firstPair.targetEvent.valueDeltaMinor).toBe(BigInt(2))
        expect(firstPair.targetEvent.valueAfterMinor).toBe(BigInt(9))
        expect(firstPair.sourceEvent.stockMovementId).toBe(
          firstPair.sourceEvent.stockMovement.id,
        )
        expect(firstPair.targetEvent.stockMovementId).toBe(
          firstPair.targetEvent.stockMovement.id,
        )
        const firstSourceDelta = firstPair.sourceEvent.valueDeltaMinor
        const firstTargetDelta = firstPair.targetEvent.valueDeltaMinor
        if (firstSourceDelta === null || firstTargetDelta === null) {
          throw new Error(
            "Known transformation pair is missing its value delta",
          )
        }
        expect(firstSourceDelta + firstTargetDelta).toBe(BigInt(0))
        expect((await requiredPool(source)).valueMinor).toBe(BigInt(3))
        expect((await requiredPool(target)).valueMinor).toBe(BigInt(9))

        // Add later receipts to both pools, then replay the earlier operation.
        // The replay must preserve its original pair and all later projections.
        const firstEffectiveAt = firstPair.sourceEvent.effectiveAt
        const laterReceiptAt = new Date(
          Math.max(Date.now(), firstEffectiveAt.getTime()),
        )
        const sourceAfterFirst = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: source.balanceSourceId },
        })
        const targetAfterFirst = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: target.balanceSourceId },
        })
        await receive({
          label: "main-source-later",
          balance: source,
          quantity: "1",
          amountMinor: "10",
          expectedBalanceRevision: sourceAfterFirst.revision,
          incurredAt: laterReceiptAt,
        })
        await receive({
          label: "main-target-later",
          balance: target,
          quantity: "1",
          amountMinor: "13",
          expectedBalanceRevision: targetAfterFirst.revision,
          incurredAt: laterReceiptAt,
        })
        expect((await requiredPool(source)).quantity.toFixed()).toBe("30")
        expect((await requiredPool(source)).valueMinor).toBe(BigInt(13))
        expect((await requiredPool(target)).quantity.toFixed()).toBe("30")
        expect((await requiredPool(target)).valueMinor).toBe(BigInt(22))
        const replaySnapshot = {
          operation: await db.stockOperation.findUniqueOrThrow({
            where: { id: first.operation.id },
            include: { movements: true, categories: true },
          }),
          events: await valuationEvents([source, target]),
          pools: await poolState([source, target]),
          balances: await balanceState([source, target]),
          operationCount: await db.stockOperation.count({
            where: { tenantId: tenant.id },
          }),
          movementCount: await db.stockMovement.count({
            where: { operation: { tenantId: tenant.id } },
          }),
          receiptCount: await db.financePurchaseReceiptLine.count({
            where: { bookId: book.id },
          }),
        }
        expect(await transformPackagedStock(db, first.command)).toEqual(
          first.operation,
        )
        expect({
          operation: await db.stockOperation.findUniqueOrThrow({
            where: { id: first.operation.id },
            include: { movements: true, categories: true },
          }),
          events: await valuationEvents([source, target]),
          pools: await poolState([source, target]),
          balances: await balanceState([source, target]),
          operationCount: await db.stockOperation.count({
            where: { tenantId: tenant.id },
          }),
          movementCount: await db.stockMovement.count({
            where: { operation: { tenantId: tenant.id } },
          }),
          receiptCount: await db.financePurchaseReceiptLine.count({
            where: { bookId: book.id },
          }),
        }).toEqual(replaySnapshot)

        const second = await transform({
          label: "known-partial-two",
          sourceBalance: source,
          targetBalance: target,
          sourceQuantity: "1",
          targetQuantity: "2",
        })
        const secondPair = await eventPair(second.operation.id)
        expect(secondPair.sourceEvent.quantityBefore.toFixed()).toBe("30")
        expect(secondPair.sourceEvent.quantityAfter.toFixed()).toBe("18")
        expect(secondPair.sourceEvent.valueBeforeMinor).toBe(BigInt(13))
        expect(secondPair.sourceEvent.sourceCostMinor).toBe(BigInt(5))
        expect(secondPair.sourceEvent.valueDeltaMinor).toBe(BigInt(-5))
        expect(secondPair.sourceEvent.valueAfterMinor).toBe(BigInt(8))
        expect(secondPair.targetEvent.valueBeforeMinor).toBe(BigInt(22))
        expect(secondPair.targetEvent.sourceCostMinor).toBe(BigInt(5))
        expect(secondPair.targetEvent.valueDeltaMinor).toBe(BigInt(5))
        expect(secondPair.targetEvent.valueAfterMinor).toBe(BigInt(27))

        const third = await transform({
          label: "known-full-residual",
          sourceBalance: source,
          targetBalance: target,
          sourceQuantity: "1.5",
          targetQuantity: "3",
        })
        const thirdPair = await eventPair(third.operation.id)
        expect(thirdPair.sourceEvent.quantityBefore.toFixed()).toBe("18")
        expect(thirdPair.sourceEvent.quantityAfter.toFixed()).toBe("0")
        expect(thirdPair.sourceEvent.valueBeforeMinor).toBe(BigInt(8))
        expect(thirdPair.sourceEvent.sourceCostMinor).toBe(BigInt(8))
        expect(thirdPair.sourceEvent.valueDeltaMinor).toBe(BigInt(-8))
        expect(thirdPair.sourceEvent.valueAfterMinor).toBe(BigInt(0))
        expect(thirdPair.targetEvent.quantityBefore.toFixed()).toBe("42")
        expect(thirdPair.targetEvent.quantityAfter.toFixed()).toBe("60")
        expect(thirdPair.targetEvent.valueBeforeMinor).toBe(BigInt(27))
        expect(thirdPair.targetEvent.sourceCostMinor).toBe(BigInt(8))
        expect(thirdPair.targetEvent.valueDeltaMinor).toBe(BigInt(8))
        expect(thirdPair.targetEvent.valueAfterMinor).toBe(BigInt(35))
        const thirdSourceDelta = thirdPair.sourceEvent.valueDeltaMinor
        const thirdTargetDelta = thirdPair.targetEvent.valueDeltaMinor
        if (thirdSourceDelta === null || thirdTargetDelta === null) {
          throw new Error(
            "Known transformation pair is missing its value delta",
          )
        }
        expect(thirdSourceDelta + thirdTargetDelta).toBe(BigInt(0))
        const finalSourcePool = await requiredPool(source)
        const finalTargetPool = await requiredPool(target)
        expect(finalSourcePool.quantity.toFixed()).toBe("0")
        expect(finalSourcePool.valueMinor).toBe(BigInt(0))
        expect(finalSourcePool.unknownReason).toBeNull()
        expect(finalTargetPool.quantity.toFixed()).toBe("60")
        expect(finalTargetPool.valueMinor).toBe(BigInt(35))
        expect(finalTargetPool.unknownReason).toBeNull()
        const finalBalances = await balanceState([source, target])
        expect(
          finalBalances.map(({ onHandQuantity }) => onHandQuantity),
        ).toEqual(["0", "10"])

        // An uncosted positive source opening becomes UNKNOWN and propagates
        // to an otherwise known destination without inventing a cost.
        await receive({
          label: "known-target-for-unknown-opening",
          balance: knownTargetForUnknown,
          quantity: "1",
          amountMinor: "7",
          expectedBalanceRevision: 0,
        })
        const unknownSourceTransform = await transform({
          label: "unknown-source-known-target",
          sourceBalance: unknownSource,
          targetBalance: knownTargetForUnknown,
          sourceQuantity: "1",
          targetQuantity: "2",
        })
        const unknownSourcePair = await eventPair(
          unknownSourceTransform.operation.id,
        )
        expect(unknownSourcePair.sourceEvent.sourceCostMinor).toBeNull()
        expect(unknownSourcePair.sourceEvent.unknownReason).toBe(
          "MISSING_OPENING_COST",
        )
        expect(unknownSourcePair.targetEvent.sourceCostMinor).toBeNull()
        expect(unknownSourcePair.targetEvent.unknownReason).toBe(
          "MISSING_OPENING_COST",
        )
        const unknownSourcePool = await requiredPool(unknownSource)
        const propagatedTargetPool = await requiredPool(knownTargetForUnknown)
        expect(unknownSourcePool.quantity.toFixed()).toBe("12")
        expect(unknownSourcePool.valueMinor).toBeNull()
        expect(unknownSourcePool.unknownReason).toBe("MISSING_OPENING_COST")
        expect(propagatedTargetPool.quantity.toFixed()).toBe("18")
        expect(propagatedTargetPool.valueMinor).toBeNull()
        expect(propagatedTargetPool.unknownReason).toBe("MISSING_OPENING_COST")

        // Conversely, a known source allocation remains attached to the pair
        // when its destination already contains UNKNOWN opening stock.
        await receive({
          label: "known-source-for-unknown-target",
          balance: knownSourceForUnknown,
          quantity: "1",
          amountMinor: "11",
          expectedBalanceRevision: 0,
        })
        const knownSourcePoolBefore = await requiredPool(knownSourceForUnknown)
        expect(knownSourcePoolBefore.valueMinor).toBe(BigInt(11))

        const foreignSnapshot = {
          balances: await balanceState([knownSourceForUnknown, unknownTarget]),
          pools: await poolState([knownSourceForUnknown, unknownTarget]),
          events: await valuationEvents([knownSourceForUnknown, unknownTarget]),
          operations: await db.stockOperation.count({
            where: { tenantId: tenant.id },
          }),
          movements: await db.stockMovement.count({
            where: { operation: { tenantId: tenant.id } },
          }),
        }
        await expect(
          transformPackagedStock(
            db,
            await transformInput({
              label: "foreign-tenant",
              sourceBalance: knownSourceForUnknown,
              targetBalance: unknownTarget,
              sourceQuantity: "1",
              targetQuantity: "2",
              tenantId: foreignTenant.id,
            }),
          ),
        ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" })
        expect({
          balances: await balanceState([knownSourceForUnknown, unknownTarget]),
          pools: await poolState([knownSourceForUnknown, unknownTarget]),
          events: await valuationEvents([knownSourceForUnknown, unknownTarget]),
          operations: await db.stockOperation.count({
            where: { tenantId: tenant.id },
          }),
          movements: await db.stockMovement.count({
            where: { operation: { tenantId: tenant.id } },
          }),
        }).toEqual(foreignSnapshot)

        const closedSnapshot = {
          balances: await balanceState([knownSourceForUnknown, unknownTarget]),
          pools: await poolState([knownSourceForUnknown, unknownTarget]),
          events: await valuationEvents([knownSourceForUnknown, unknownTarget]),
          operations: await db.stockOperation.count({
            where: { tenantId: tenant.id },
          }),
          movements: await db.stockMovement.count({
            where: { operation: { tenantId: tenant.id } },
          }),
        }
        await db.$transaction(
          (tx) =>
            tx.financeBook.update({
              where: { id: book.id },
              data: { closedThrough: new Date(Date.now() + 60_000) },
            }),
          { maxWait: 10_000, timeout: 30_000 },
        )
        await expect(
          transform({
            label: "closed-period-known-to-unknown",
            sourceBalance: knownSourceForUnknown,
            targetBalance: unknownTarget,
            sourceQuantity: "1",
            targetQuantity: "2",
          }),
        ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
        expect({
          balances: await balanceState([knownSourceForUnknown, unknownTarget]),
          pools: await poolState([knownSourceForUnknown, unknownTarget]),
          events: await valuationEvents([knownSourceForUnknown, unknownTarget]),
          operations: await db.stockOperation.count({
            where: { tenantId: tenant.id },
          }),
          movements: await db.stockMovement.count({
            where: { operation: { tenantId: tenant.id } },
          }),
        }).toEqual(closedSnapshot)
        await db.$transaction(
          (tx) =>
            tx.financeBook.update({
              where: { id: book.id },
              data: { closedThrough: null },
            }),
          { maxWait: 10_000, timeout: 30_000 },
        )

        const unknownTargetTransform = await transform({
          label: "known-source-unknown-target",
          sourceBalance: knownSourceForUnknown,
          targetBalance: unknownTarget,
          sourceQuantity: "1",
          targetQuantity: "2",
        })
        const unknownTargetPair = await eventPair(
          unknownTargetTransform.operation.id,
        )
        expect(unknownTargetPair.sourceEvent.sourceCostMinor).toBe(BigInt(11))
        expect(unknownTargetPair.sourceEvent.valueDeltaMinor).toBe(BigInt(-11))
        expect(unknownTargetPair.sourceEvent.valueAfterMinor).toBe(BigInt(0))
        expect(unknownTargetPair.targetEvent.sourceCostMinor).toBe(BigInt(11))
        expect(unknownTargetPair.targetEvent.valueBeforeMinor).toBeNull()
        expect(unknownTargetPair.targetEvent.valueDeltaMinor).toBeNull()
        expect(unknownTargetPair.targetEvent.valueAfterMinor).toBeNull()
        expect(unknownTargetPair.targetEvent.unknownReason).toBe(
          "MISSING_OPENING_COST",
        )
        const sourceAfterUnknownTarget = await requiredPool(
          knownSourceForUnknown,
        )
        const unknownTargetPool = await requiredPool(unknownTarget)
        expect(sourceAfterUnknownTarget.quantity.toFixed()).toBe("0")
        expect(sourceAfterUnknownTarget.valueMinor).toBe(BigInt(0))
        expect(unknownTargetPool.quantity.toFixed()).toBe("18")
        expect(unknownTargetPool.valueMinor).toBeNull()
        expect(unknownTargetPool.unknownReason).toBe("MISSING_OPENING_COST")

        expect(
          await db.financeJournalEntry.count({
            where: {
              bookId: book.id,
              sourceId: { in: transformOperationIds },
            },
          }),
        ).toBe(0)
      } finally {
        const cleanupBookId = bookId
        const cleanupActorUserId = actorUserId
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
            if (catalogItemIds.length) {
              await tx.catalogItem.deleteMany({
                where: { id: { in: catalogItemIds } },
              })
            }
            if (storeIds.length) {
              await tx.store.deleteMany({ where: { id: { in: storeIds } } })
            }
            if (tenantIds.length && cleanupActorUserId) {
              await tx.membership.deleteMany({
                where: {
                  tenantId: { in: tenantIds },
                  userId: cleanupActorUserId,
                },
              })
            }
            if (tenantIds.length) {
              await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
            }
            if (cleanupActorUserId) {
              await tx.user.deleteMany({ where: { id: cleanupActorUserId } })
            }
          },
          { maxWait: 10_000, timeout: 30_000 },
        )

        const [
          remainingTenants,
          remainingStores,
          remainingItems,
          remainingBook,
          remainingSupplier,
          remainingBalances,
          remainingBills,
          remainingReceipts,
          remainingReceiptEvents,
          remainingReceiptMovements,
          remainingReceiptOperations,
          remainingTransformOperations,
          remainingTransformEvents,
          remainingTransformMovements,
          remainingPools,
          remainingBookEvents,
          remainingBookPools,
          remainingBookReceipts,
          remainingTenantOperations,
          remainingTenantMovements,
          remainingUsers,
        ] = await Promise.all([
          db.tenant.count({ where: { id: { in: tenantIds } } }),
          db.store.count({ where: { id: { in: storeIds } } }),
          db.catalogItem.count({ where: { id: { in: catalogItemIds } } }),
          bookId ? db.financeBook.count({ where: { id: bookId } }) : 0,
          supplierId
            ? db.financeSupplierAccount.count({ where: { id: supplierId } })
            : 0,
          db.stockBalanceSource.count({
            where: { id: { in: balanceSourceIds } },
          }),
          db.financeBill.count({ where: { id: { in: billIds } } }),
          db.financePurchaseReceiptLine.count({
            where: { id: { in: receiptIds } },
          }),
          db.financeInventoryValuationEvent.count({
            where: { id: { in: receiptEventIds } },
          }),
          db.stockMovement.count({ where: { id: { in: receiptMovementIds } } }),
          db.stockOperation.count({
            where: { id: { in: receiptOperationIds } },
          }),
          db.stockOperation.count({
            where: { id: { in: transformOperationIds } },
          }),
          db.financeInventoryValuationEvent.count({
            where: { id: { in: transformEventIds } },
          }),
          db.stockMovement.count({
            where: { id: { in: transformMovementIds } },
          }),
          db.financeInventoryPool.count({ where: { id: { in: poolIds } } }),
          bookId
            ? db.financeInventoryValuationEvent.count({ where: { bookId } })
            : 0,
          bookId ? db.financeInventoryPool.count({ where: { bookId } }) : 0,
          bookId
            ? db.financePurchaseReceiptLine.count({ where: { bookId } })
            : 0,
          db.stockOperation.count({
            where: { tenantId: { in: tenantIds } },
          }),
          db.stockMovement.count({
            where: { operation: { tenantId: { in: tenantIds } } },
          }),
          actorUserId ? db.user.count({ where: { id: actorUserId } }) : 0,
        ])
        expect({
          tenants: remainingTenants,
          stores: remainingStores,
          items: remainingItems,
          book: remainingBook,
          supplier: remainingSupplier,
          balances: remainingBalances,
          bills: remainingBills,
          receipts: remainingReceipts,
          receiptEvents: remainingReceiptEvents,
          receiptMovements: remainingReceiptMovements,
          receiptOperations: remainingReceiptOperations,
          transformOperations: remainingTransformOperations,
          transformEvents: remainingTransformEvents,
          transformMovements: remainingTransformMovements,
          pools: remainingPools,
          bookEvents: remainingBookEvents,
          bookPools: remainingBookPools,
          bookReceipts: remainingBookReceipts,
          tenantOperations: remainingTenantOperations,
          tenantMovements: remainingTenantMovements,
          users: remainingUsers,
        }).toEqual({
          tenants: 0,
          stores: 0,
          items: 0,
          book: 0,
          supplier: 0,
          balances: 0,
          bills: 0,
          receipts: 0,
          receiptEvents: 0,
          receiptMovements: 0,
          receiptOperations: 0,
          transformOperations: 0,
          transformEvents: 0,
          transformMovements: 0,
          pools: 0,
          bookEvents: 0,
          bookPools: 0,
          bookReceipts: 0,
          tenantOperations: 0,
          tenantMovements: 0,
          users: 0,
        })
      }
    })
  },
)
