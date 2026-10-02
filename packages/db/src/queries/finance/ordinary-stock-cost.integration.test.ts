import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  correctStockOperation,
  postSingleBalanceStockOperation,
} from "../inventory-operations"
import { createFinanceBook } from "./accounts"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const RECEIPT_DATE = new Date("2026-09-15T12:00:00.000Z")
setDefaultTimeout(600_000)

type OrdinaryBalance = {
  balanceSourceId: string
  configurationVersionId: string
  enteredInventoryUnitId: string
  kind: "PACKAGED_STOCK" | "SHARED_POOL"
  transactionScale: number
  unitFactor: string
}

function assertCleanup(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

describeWithServiceCommerceDatabase(
  "ordinary stock valuation acceptance",
  () => {
    test("values known withdrawals and grouped corrections without trusting snapshots", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const tenantIds: string[] = []
      const storeIds: string[] = []
      const catalogItemIds: string[] = []
      const balanceSourceIds: string[] = []
      const actorUserIds: string[] = []
      let cleanupBookId: string | undefined
      let supplierId: string | undefined

      try {
        const owner = await db.user.create({
          data: {
            email: `ordinary-stock-cost-${runId}@example.invalid`,
            name: "Ordinary stock cost QA owner",
          },
        })
        actorUserIds.push(owner.id)
        const tenant = await db.tenant.create({
          data: {
            name: "Ordinary stock cost QA",
            slug: `ordinary-stock-cost-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(tenant.id)
        const manager = await db.user.create({
          data: {
            email: `ordinary-stock-cost-manager-${runId}@example.invalid`,
            name: "Ordinary stock cost QA manager",
          },
        })
        actorUserIds.push(manager.id)
        await db.membership.create({
          data: {
            tenantId: tenant.id,
            userId: manager.id,
            role: "MANAGER",
            status: "ACTIVE",
          },
        })
        const foreignTenant = await db.tenant.create({
          data: {
            name: "Foreign ordinary stock cost QA",
            slug: `ordinary-stock-cost-foreign-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(foreignTenant.id)
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Private ordinary stock cost store",
            slug: `ordinary-stock-cost-${runId}`,
            status: "ACTIVE",
          },
        })
        storeIds.push(store.id)
        const noBookStore = await db.store.create({
          data: {
            tenantId: foreignTenant.id,
            name: "Private ordinary stock cost no-book store",
            slug: `ordinary-stock-cost-no-book-${runId}`,
            status: "ACTIVE",
          },
        })
        storeIds.push(noBookStore.id)

        const item = await db.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: `ordinary-stock-cost-${runId}`,
            kind: "PRODUCT",
            name: "Ordinary stock cost QA Product",
            product: { create: {} },
            variants: {
              create: [
                { key: "known", name: "Known withdrawal", isDefault: true },
                {
                  key: "gain",
                  name: "Untrusted positive adjustment",
                  isDefault: false,
                },
                { key: "full", name: "Full residual", isDefault: false },
                {
                  key: "legacy",
                  name: "Legacy missing event",
                  isDefault: false,
                },
                { key: "shared", name: "Shared unit", isDefault: false },
              ],
            },
          },
          include: { product: true, variants: true },
        })
        catalogItemIds.push(item.id)
        const product = item.product
        const knownVariant = item.variants.find(
          (candidate) => candidate.key === "known",
        )
        const gainVariant = item.variants.find(
          (candidate) => candidate.key === "gain",
        )
        const fullVariant = item.variants.find(
          (candidate) => candidate.key === "full",
        )
        const legacyVariant = item.variants.find(
          (candidate) => candidate.key === "legacy",
        )
        const sharedVariant = item.variants.find(
          (candidate) => candidate.key === "shared",
        )
        if (
          !product ||
          !knownVariant ||
          !gainVariant ||
          !fullVariant ||
          !legacyVariant ||
          !sharedVariant
        ) {
          throw new Error("Incomplete ordinary stock cost Product fixture")
        }
        const productId = product.id
        const configuration = await db.unitConfigurationVersion.create({
          data: {
            productId,
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
                  key: "case",
                  name: "case",
                  factor: "12",
                  stockBehavior: "PACKAGED_STOCK",
                  transactionScale: 3,
                },
                {
                  key: "case-alt",
                  name: "alternate case",
                  factor: "12",
                  stockBehavior: "ALTERNATE_TRANSACTION",
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
        const caseUnit = configuration.units.find((unit) => unit.key === "case")
        const alternateCaseUnit = configuration.units.find(
          (unit) => unit.key === "case-alt",
        )
        if (!canonicalUnit || !caseUnit || !alternateCaseUnit) {
          throw new Error("Missing ordinary stock cost inventory unit")
        }
        const configurationVersionId = configuration.id
        const canonicalUnitId = canonicalUnit.id
        const caseUnitId = caseUnit.id
        const canonicalUnitFactor = canonicalUnit.factor.toString()
        const canonicalTransactionScale = canonicalUnit.transactionScale
        const caseUnitFactor = caseUnit.factor.toString()
        const caseTransactionScale = caseUnit.transactionScale
        const alternateCaseUnitId = alternateCaseUnit.id
        const alternateCaseUnitFactor = alternateCaseUnit.factor.toString()
        const alternateCaseTransactionScale = alternateCaseUnit.transactionScale
        expect(alternateCaseUnitFactor).toBe("12")
        expect(alternateCaseTransactionScale).toBe(3)
        await db.catalogProduct.update({
          where: { id: productId },
          data: { currentUnitConfigurationVersionId: configurationVersionId },
        })

        async function createBalance(input: {
          configurationVersionId?: string
          enteredUnitId?: string
          factor: string
          initialQuantity: string
          kind: OrdinaryBalance["kind"]
          transactionScale: number
          unitId: string
          variantId: string
          targetStoreId?: string
          targetTenantId?: string
          targetProductId?: string
        }): Promise<OrdinaryBalance> {
          const balance = await db.stockBalanceSource.create({
            data: {
              tenantId: input.targetTenantId ?? tenant.id,
              storeId: input.targetStoreId ?? store.id,
              productId: input.targetProductId ?? productId,
              variantId: input.variantId,
              inventoryUnitId: input.unitId,
              kind: input.kind,
              onHandQuantity: input.initialQuantity,
            },
          })
          balanceSourceIds.push(balance.id)
          return {
            balanceSourceId: balance.id,
            configurationVersionId:
              input.configurationVersionId ?? configurationVersionId,
            enteredInventoryUnitId: input.enteredUnitId ?? input.unitId,
            kind: input.kind,
            transactionScale: input.transactionScale,
            unitFactor: input.factor,
          }
        }

        const knownBalance = await createBalance({
          factor: caseUnitFactor,
          initialQuantity: "0",
          kind: "PACKAGED_STOCK",
          transactionScale: caseTransactionScale,
          unitId: caseUnitId,
          variantId: knownVariant.id,
        })
        const gainBalance = await createBalance({
          factor: caseUnitFactor,
          initialQuantity: "0",
          kind: "PACKAGED_STOCK",
          transactionScale: caseTransactionScale,
          unitId: caseUnitId,
          variantId: gainVariant.id,
        })
        const fullBalance = await createBalance({
          factor: caseUnitFactor,
          initialQuantity: "0",
          kind: "PACKAGED_STOCK",
          transactionScale: caseTransactionScale,
          unitId: caseUnitId,
          variantId: fullVariant.id,
        })
        const legacyBalance = await createBalance({
          factor: caseUnitFactor,
          initialQuantity: "0",
          kind: "PACKAGED_STOCK",
          transactionScale: caseTransactionScale,
          unitId: caseUnitId,
          variantId: legacyVariant.id,
        })
        const sharedBalance = await createBalance({
          factor: canonicalUnitFactor,
          enteredUnitId: canonicalUnitId,
          initialQuantity: "0",
          kind: "SHARED_POOL",
          transactionScale: canonicalTransactionScale,
          unitId: canonicalUnitId,
          variantId: sharedVariant.id,
        })

        const noBookItem = await db.catalogItem.create({
          data: {
            tenantId: foreignTenant.id,
            slug: `ordinary-stock-cost-no-book-${runId}`,
            kind: "PRODUCT",
            name: "No-book ordinary stock QA Product",
            product: { create: {} },
            variants: {
              create: { key: "default", name: "Default", isDefault: true },
            },
          },
          include: { product: true, variants: true },
        })
        catalogItemIds.push(noBookItem.id)
        const noBookProduct = noBookItem.product
        const noBookVariant = noBookItem.variants[0]
        if (!noBookProduct || !noBookVariant) {
          throw new Error("Incomplete no-book ordinary stock Product fixture")
        }
        const noBookProductId = noBookProduct.id
        const noBookConfiguration = await db.unitConfigurationVersion.create({
          data: {
            productId: noBookProductId,
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
        const noBookUnit = noBookConfiguration.units.find(
          (unit) => unit.key === "case",
        )
        if (!noBookUnit) throw new Error("Missing no-book case unit")
        const noBookConfigurationVersionId = noBookConfiguration.id
        const noBookUnitId = noBookUnit.id
        const noBookUnitFactor = noBookUnit.factor.toString()
        const noBookTransactionScale = noBookUnit.transactionScale
        await db.catalogProduct.update({
          where: { id: noBookProductId },
          data: {
            currentUnitConfigurationVersionId: noBookConfigurationVersionId,
          },
        })
        const noBookBalance = await createBalance({
          configurationVersionId: noBookConfigurationVersionId,
          factor: noBookUnitFactor,
          initialQuantity: "0",
          kind: "PACKAGED_STOCK",
          transactionScale: noBookTransactionScale,
          unitId: noBookUnitId,
          variantId: noBookVariant.id,
          targetStoreId: noBookStore.id,
          targetTenantId: foreignTenant.id,
          targetProductId: noBookProductId,
        })

        const book = await createFinanceBook(db, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          startsAt: BOOK_START,
        })
        cleanupBookId = book.id
        const expense = await db.financeAccount.findUnique({
          where: { bookId_code: { bookId: book.id, code: "6000" } },
        })
        const inventory = await db.financeAccount.findUnique({
          where: { bookId_code: { bookId: book.id, code: "1300" } },
        })
        if (!expense || !inventory) {
          throw new Error("Missing ordinary stock cost control accounts")
        }
        const supplier = await createFinanceSupplier(db, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          bookId: book.id,
          clientCommandId: `ordinary-stock-cost-supplier-${runId}`,
          code: `OSC-${runId.slice(0, 8)}`,
          name: "Ordinary stock cost QA supplier",
        })
        supplierId = supplier.id

        async function receive(
          balance: OrdinaryBalance,
          label: string,
          amountMinor: string,
          enteredQuantity: string,
          expectedBalanceRevision: number,
          incurredAt: Date,
        ) {
          return recordFinancePurchase(db, {
            tenantId: tenant.id,
            actorUserId: owner.id,
            bookId: book.id,
            clientCommandId: `ordinary-stock-cost-${label}-${runId}`,
            supplierId: supplier.id,
            storeId: store.id,
            description: `QA ${label}`,
            incurredAt,
            lines: [
              {
                balanceSourceId: balance.balanceSourceId,
                enteredInventoryUnitId: balance.enteredInventoryUnitId,
                expectedConfigurationVersionId: balance.configurationVersionId,
                description: `QA ${label}`,
                amountMinor,
                enteredQuantity,
                expectedBalanceRevision,
                categories: [
                  { name: `Ordinary ${label} ${runId.slice(0, 8)}` },
                ],
              },
            ],
          })
        }

        await receive(
          knownBalance,
          "known-opening",
          "1001",
          "2",
          0,
          RECEIPT_DATE,
        )
        await receive(gainBalance, "gain-opening", "333", "1", 0, RECEIPT_DATE)
        await receive(fullBalance, "full-opening", "1402", "2", 0, RECEIPT_DATE)
        await receive(
          legacyBalance,
          "legacy-opening",
          "1001",
          "2",
          0,
          RECEIPT_DATE,
        )
        await receive(
          sharedBalance,
          "shared-opening",
          "101",
          "24",
          0,
          RECEIPT_DATE,
        )

        function ordinaryInput(input: {
          balance: OrdinaryBalance
          clientOperationId: string
          direction: "increase" | "decrease"
          enteredInventoryUnitId?: string
          effectiveAt?: Date
          enteredQuantity: string
          expectedBalanceRevision: number
          type: "adjustment" | "receipt" | "return"
          unitCostMinor?: number
        }) {
          return {
            actorUserId: manager.id,
            balanceSourceId: input.balance.balanceSourceId,
            clientOperationId: input.clientOperationId,
            direction: input.direction,
            effectiveAt: input.effectiveAt,
            enteredInventoryUnitId:
              input.enteredInventoryUnitId ??
              input.balance.enteredInventoryUnitId,
            enteredQuantity: input.enteredQuantity,
            expectedBalanceRevision: input.expectedBalanceRevision,
            expectedConfigurationVersionId:
              input.balance.configurationVersionId,
            reason: "QA ordinary inventory operation",
            schemaVersion: 1,
            source: "ordinary_stock_cost_acceptance",
            storeId: store.id,
            tenantId: tenant.id,
            type: input.type,
            unitCostMinor: input.unitCostMinor,
          }
        }

        function correctionInput(input: {
          correctedEnteredQuantity: string
          expectedBalanceRevision: number
          movementId: string
          sourceOperationId: string
          clientOperationId: string
        }) {
          return {
            actorUserId: manager.id,
            clientOperationId: input.clientOperationId,
            corrections: [
              {
                correctedEnteredQuantity: input.correctedEnteredQuantity,
                expectedBalanceRevision: input.expectedBalanceRevision,
                movementId: input.movementId,
              },
            ],
            reason: "QA ordinary source correction",
            schemaVersion: 1,
            source: "ordinary_stock_cost_acceptance_correction",
            targetOperationId: input.sourceOperationId,
            tenantId: tenant.id,
          }
        }

        const initialWithdrawalInput = ordinaryInput({
          balance: knownBalance,
          clientOperationId: `ordinary-stock-cost-withdrawal-${runId}`,
          direction: "decrease",
          effectiveAt: new Date("2026-09-16T12:00:00.000Z"),
          enteredQuantity: "1",
          expectedBalanceRevision: 1,
          type: "adjustment",
          unitCostMinor: 999,
        })
        const [initialWithdrawal, freshWithdrawalReplay] = await Promise.all([
          postSingleBalanceStockOperation(db, initialWithdrawalInput),
          postSingleBalanceStockOperation(db, initialWithdrawalInput),
        ])
        expect(freshWithdrawalReplay).toEqual(initialWithdrawal)
        expect(initialWithdrawal.movements).toHaveLength(1)
        const originalWithdrawalMovement = initialWithdrawal.movements[0]
        if (!originalWithdrawalMovement) {
          throw new Error("Ordinary withdrawal has no Stock Movement")
        }
        const initialWithdrawalEvent =
          await db.financeInventoryValuationEvent.findUniqueOrThrow({
            where: { stockMovementId: originalWithdrawalMovement.id },
          })
        expect(
          await db.financeInventoryValuationEvent.count({
            where: {
              bookId: book.id,
              sourceKind: "ORDINARY_STOCK_OPERATION",
              sourceId: initialWithdrawal.id,
            },
          }),
        ).toBe(1)
        expect(initialWithdrawalEvent).toMatchObject({
          kind: "ADJUSTMENT",
          sourceKind: "ORDINARY_STOCK_OPERATION",
          sourceId: initialWithdrawal.id,
          sourceCostMinor: BigInt(500),
          valueBeforeMinor: BigInt(1001),
          valueDeltaMinor: BigInt(-500),
          valueAfterMinor: BigInt(501),
          unknownReason: null,
          actorUserId: manager.id,
        })
        expect(initialWithdrawalEvent.canonicalEffect.toFixed()).toBe("-12")
        expect(initialWithdrawalEvent.quantityBefore.toFixed()).toBe("24")
        expect(initialWithdrawalEvent.quantityAfter.toFixed()).toBe("12")
        expect(originalWithdrawalMovement.unitCostMinorSnapshot).toBe(999)
        const partialPool = await db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: knownBalance.balanceSourceId,
            },
          },
        })
        expect(partialPool.quantity.toFixed()).toBe("12")
        expect(partialPool.valueMinor).toBe(BigInt(501))

        const laterPurchase = await receive(
          knownBalance,
          "before-correction",
          "900",
          "1",
          2,
          new Date("2026-09-17T12:00:00.000Z"),
        )
        expect(laterPurchase.id).toBeTruthy()
        const freshCorrectionInput = correctionInput({
          correctedEnteredQuantity: "0.5",
          expectedBalanceRevision: 3,
          movementId: originalWithdrawalMovement.id,
          sourceOperationId: initialWithdrawal.id,
          clientOperationId: `ordinary-stock-cost-correction-${runId}`,
        })
        const [correction, freshCorrectionReplay] = await Promise.all([
          correctStockOperation(db, freshCorrectionInput),
          correctStockOperation(db, freshCorrectionInput),
        ])
        expect(freshCorrectionReplay).toEqual(correction)
        expect(correction.type).toBe("CORRECTION")
        expect(correction.movements).toHaveLength(2)
        expect(
          await db.stockOperation.count({
            where: {
              tenantId: tenant.id,
              clientOperationId: freshCorrectionInput.clientOperationId,
            },
          }),
        ).toBe(1)
        const inverseMovement = correction.movements.find(
          (movement) => movement.signedCanonicalEffect === "12",
        )
        const replacementMovement = correction.movements.find(
          (movement) => movement.signedCanonicalEffect === "-6",
        )
        if (!inverseMovement || !replacementMovement) {
          throw new Error(
            "Grouped ordinary correction did not create both legs",
          )
        }
        const inverseMovementRecord = await db.stockMovement.findUniqueOrThrow({
          where: { id: inverseMovement.id },
        })
        expect(inverseMovementRecord.reversalOfMovementId).toBe(
          originalWithdrawalMovement.id,
        )
        expect(inverseMovement.signedCanonicalEffect).toBe("12")
        expect(inverseMovement.previousOnHandQuantity).toBe("2")
        expect(inverseMovement.resultingOnHandQuantity).toBe("3")
        expect(replacementMovement.signedCanonicalEffect).toBe("-6")
        expect(replacementMovement.previousOnHandQuantity).toBe("3")
        expect(replacementMovement.resultingOnHandQuantity).toBe("2.5")
        const correctionEvents =
          await db.financeInventoryValuationEvent.findMany({
            where: {
              bookId: book.id,
              sourceKind: "ORDINARY_STOCK_CORRECTION",
              sourceId: correction.id,
            },
            orderBy: { sequence: "asc" },
          })
        expect(correctionEvents).toHaveLength(2)
        const inverseEvent = correctionEvents.find(
          (event) => event.stockMovementId === inverseMovement.id,
        )
        const replacementEvent = correctionEvents.find(
          (event) => event.stockMovementId === replacementMovement.id,
        )
        if (!inverseEvent || !replacementEvent) {
          throw new Error(
            "Grouped ordinary correction valuation legs are missing",
          )
        }
        expect(inverseEvent.canonicalEffect.toFixed()).toBe("12")
        expect(inverseEvent.sourceCostMinor).toBe(BigInt(500))
        expect(inverseEvent.valueBeforeMinor).toBe(BigInt(1401))
        expect(inverseEvent.valueDeltaMinor).toBe(BigInt(500))
        expect(inverseEvent.valueAfterMinor).toBe(BigInt(1901))
        expect(replacementEvent.canonicalEffect.toFixed()).toBe("-6")
        expect(replacementEvent.sourceCostMinor).toBe(BigInt(317))
        expect(replacementEvent.valueBeforeMinor).toBe(BigInt(1901))
        expect(replacementEvent.valueDeltaMinor).toBe(BigInt(-317))
        expect(replacementEvent.valueAfterMinor).toBe(BigInt(1584))
        const correctedPool = await db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: knownBalance.balanceSourceId,
            },
          },
        })
        expect(correctedPool.quantity.toFixed()).toBe("30")
        expect(correctedPool.valueMinor).toBe(BigInt(1584))

        const replayReceiptDate = new Date()
        await receive(
          knownBalance,
          "after-correction",
          "900",
          "1",
          4,
          replayReceiptDate,
        )
        const unrelatedOrdinary = await postSingleBalanceStockOperation(
          db,
          ordinaryInput({
            balance: sharedBalance,
            clientOperationId: `ordinary-stock-cost-shared-withdraw-${runId}`,
            direction: "decrease",
            enteredInventoryUnitId: alternateCaseUnitId,
            effectiveAt: new Date(replayReceiptDate.getTime() + 1),
            enteredQuantity: "1",
            expectedBalanceRevision: 1,
            type: "adjustment",
          }),
        )
        expect(unrelatedOrdinary.movements).toHaveLength(1)
        const beforeReplayEvents =
          await db.financeInventoryValuationEvent.findMany({
            where: {
              bookId: book.id,
              balanceSourceId: knownBalance.balanceSourceId,
            },
            orderBy: { sequence: "asc" },
          })
        const beforeReplayPool =
          await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: knownBalance.balanceSourceId,
              },
            },
          })
        const [correctedReplay, concurrentCorrectedReplay] = await Promise.all([
          correctStockOperation(
            db,
            correctionInput({
              correctedEnteredQuantity: "0.5",
              expectedBalanceRevision: 3,
              movementId: originalWithdrawalMovement.id,
              sourceOperationId: initialWithdrawal.id,
              clientOperationId: `ordinary-stock-cost-correction-${runId}`,
            }),
          ),
          correctStockOperation(
            db,
            correctionInput({
              correctedEnteredQuantity: "0.5",
              expectedBalanceRevision: 3,
              movementId: originalWithdrawalMovement.id,
              sourceOperationId: initialWithdrawal.id,
              clientOperationId: `ordinary-stock-cost-correction-${runId}`,
            }),
          ),
        ])
        expect(correctedReplay).toEqual(correction)
        expect(concurrentCorrectedReplay).toEqual(correction)
        const [ordinaryReplay, concurrentOrdinaryReplay] = await Promise.all([
          postSingleBalanceStockOperation(db, initialWithdrawalInput),
          postSingleBalanceStockOperation(db, initialWithdrawalInput),
        ])
        expect(ordinaryReplay).toEqual(initialWithdrawal)
        expect(concurrentOrdinaryReplay).toEqual(initialWithdrawal)
        expect(
          await db.financeInventoryValuationEvent.findMany({
            where: {
              bookId: book.id,
              balanceSourceId: knownBalance.balanceSourceId,
            },
            orderBy: { sequence: "asc" },
          }),
        ).toEqual(beforeReplayEvents)
        expect(
          await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: knownBalance.balanceSourceId,
              },
            },
          }),
        ).toEqual(beforeReplayPool)
        expect(
          await db.stockOperation.count({
            where: {
              tenantId: tenant.id,
              clientOperationId: initialWithdrawalInput.clientOperationId,
            },
          }),
        ).toBe(1)
        expect(
          await db.stockOperation.count({
            where: {
              tenantId: tenant.id,
              clientOperationId: `ordinary-stock-cost-correction-${runId}`,
            },
          }),
        ).toBe(1)

        const fullWithdrawalInput = ordinaryInput({
          balance: fullBalance,
          clientOperationId: `ordinary-stock-cost-full-withdrawal-${runId}`,
          direction: "decrease",
          effectiveAt: new Date("2026-09-16T12:00:00.000Z"),
          enteredQuantity: "1",
          expectedBalanceRevision: 1,
          type: "adjustment",
        })
        const fullWithdrawal = await postSingleBalanceStockOperation(
          db,
          fullWithdrawalInput,
        )
        const fullMovement = fullWithdrawal.movements[0]
        if (!fullMovement) throw new Error("Full withdrawal has no movement")
        const fullEvent =
          await db.financeInventoryValuationEvent.findUniqueOrThrow({
            where: { stockMovementId: fullMovement.id },
          })
        expect(fullEvent.sourceCostMinor).toBe(BigInt(701))
        expect(fullEvent.valueBeforeMinor).toBe(BigInt(1402))
        expect(fullEvent.valueAfterMinor).toBe(BigInt(701))
        const fullBalanceAfterFirstWithdrawal =
          await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: fullBalance.balanceSourceId,
              },
            },
          })
        expect(fullBalanceAfterFirstWithdrawal.quantity.toFixed()).toBe("12")
        expect(fullBalanceAfterFirstWithdrawal.valueMinor).toBe(BigInt(701))

        const closedCorrectionInput = correctionInput({
          correctedEnteredQuantity: "0.5",
          expectedBalanceRevision: 2,
          movementId: fullMovement.id,
          sourceOperationId: fullWithdrawal.id,
          clientOperationId: `ordinary-stock-cost-closed-correction-${runId}`,
        })
        const closedOrdinaryOperationInput = ordinaryInput({
          balance: fullBalance,
          clientOperationId: `ordinary-stock-cost-closed-operation-${runId}`,
          direction: "decrease",
          enteredQuantity: "0.25",
          expectedBalanceRevision: 2,
          type: "adjustment",
        })
        const closedOperationIds = [
          closedCorrectionInput.clientOperationId,
          closedOrdinaryOperationInput.clientOperationId,
        ]
        const captureClosedCorrectionState = async () => {
          const [balance, pool, events, operations, movements, journals] =
            await Promise.all([
              db.stockBalanceSource.findUniqueOrThrow({
                where: { id: fullBalance.balanceSourceId },
              }),
              db.financeInventoryPool.findUniqueOrThrow({
                where: {
                  bookId_balanceSourceId: {
                    bookId: book.id,
                    balanceSourceId: fullBalance.balanceSourceId,
                  },
                },
              }),
              db.financeInventoryValuationEvent.findMany({
                where: {
                  bookId: book.id,
                  balanceSourceId: fullBalance.balanceSourceId,
                },
                orderBy: { sequence: "asc" },
              }),
              db.stockOperation.count({
                where: {
                  tenantId: tenant.id,
                  clientOperationId: { in: closedOperationIds },
                },
              }),
              db.stockMovement.count({
                where: {
                  operation: {
                    tenantId: tenant.id,
                    clientOperationId: { in: closedOperationIds },
                  },
                },
              }),
              db.financeJournalEntry.count({ where: { bookId: book.id } }),
            ])
          return { balance, pool, events, operations, movements, journals }
        }
        const closedCorrectionBefore = await captureClosedCorrectionState()
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: new Date(Date.now() + 600_000) },
        })
        try {
          const closedResults = await Promise.allSettled([
            expect(
              postSingleBalanceStockOperation(db, closedOrdinaryOperationInput),
            ).rejects.toMatchObject({ code: "CLOSED_PERIOD" }),
            expect(
              correctStockOperation(db, closedCorrectionInput),
            ).rejects.toMatchObject({ code: "CLOSED_PERIOD" }),
          ])
          for (const result of closedResults) {
            if (result.status === "rejected") throw result.reason
          }
        } finally {
          await db.financeBook.update({
            where: { id: book.id },
            data: { closedThrough: null },
          })
        }
        expect(await captureClosedCorrectionState()).toEqual(
          closedCorrectionBefore,
        )
        const fullDepletion = await postSingleBalanceStockOperation(
          db,
          ordinaryInput({
            balance: fullBalance,
            clientOperationId: `ordinary-stock-cost-full-residual-${runId}`,
            direction: "decrease",
            enteredQuantity: "1",
            expectedBalanceRevision: 2,
            type: "adjustment",
          }),
        )
        const fullDepletionMovement = fullDepletion.movements[0]
        if (!fullDepletionMovement) {
          throw new Error("Final residual withdrawal has no movement")
        }
        const fullDepletionEvent =
          await db.financeInventoryValuationEvent.findUniqueOrThrow({
            where: { stockMovementId: fullDepletionMovement.id },
          })
        expect(fullDepletionEvent.sourceCostMinor).toBe(BigInt(701))
        expect(fullDepletionEvent.valueBeforeMinor).toBe(BigInt(701))
        expect(fullDepletionEvent.valueDeltaMinor).toBe(BigInt(-701))
        expect(fullDepletionEvent.valueAfterMinor).toBe(BigInt(0))
        const depletedPool = await db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: fullBalance.balanceSourceId,
            },
          },
        })
        expect(depletedPool.quantity.toFixed()).toBe("0")
        expect(depletedPool.valueMinor).toBe(BigInt(0))

        const gainAfterDepletion = await postSingleBalanceStockOperation(
          db,
          ordinaryInput({
            balance: fullBalance,
            clientOperationId: `ordinary-stock-cost-gain-after-depletion-${runId}`,
            direction: "increase",
            enteredQuantity: "1",
            expectedBalanceRevision: 3,
            type: "receipt",
            unitCostMinor: 444,
          }),
        )
        const gainAfterDepletionMovement = gainAfterDepletion.movements[0]
        if (!gainAfterDepletionMovement) {
          throw new Error("Post-depletion gain has no Stock Movement")
        }
        const gainAfterDepletionEvent =
          await db.financeInventoryValuationEvent.findUniqueOrThrow({
            where: { stockMovementId: gainAfterDepletionMovement.id },
          })
        expect(gainAfterDepletionEvent.sourceCostMinor).toBeNull()
        expect(gainAfterDepletionEvent.valueBeforeMinor).toBe(BigInt(0))
        expect(gainAfterDepletionEvent.valueDeltaMinor).toBeNull()
        expect(gainAfterDepletionEvent.valueAfterMinor).toBeNull()
        expect(gainAfterDepletionEvent.unknownReason).toBe(
          "UNCAPTURED_MOVEMENTS",
        )
        const restoreKnownCostIntoUnknown = await correctStockOperation(
          db,
          correctionInput({
            correctedEnteredQuantity: "0.5",
            expectedBalanceRevision: 4,
            movementId: fullMovement.id,
            sourceOperationId: fullWithdrawal.id,
            clientOperationId: `ordinary-stock-cost-known-restore-unknown-${runId}`,
          }),
        )
        const unknownRestoreEvents =
          await db.financeInventoryValuationEvent.findMany({
            where: {
              bookId: book.id,
              sourceKind: "ORDINARY_STOCK_CORRECTION",
              sourceId: restoreKnownCostIntoUnknown.id,
            },
            orderBy: { sequence: "asc" },
          })
        expect(unknownRestoreEvents).toHaveLength(2)
        const knownRestoreEvent = unknownRestoreEvents.find(
          (event) => event.canonicalEffect.toString() === "12",
        )
        const unknownReplacementEvent = unknownRestoreEvents.find(
          (event) => event.canonicalEffect.toString() === "-6",
        )
        if (!knownRestoreEvent || !unknownReplacementEvent) {
          throw new Error("Unknown-pool correction legs are missing")
        }
        expect(knownRestoreEvent.sourceCostMinor).toBe(BigInt(701))
        expect(knownRestoreEvent.valueBeforeMinor).toBeNull()
        expect(knownRestoreEvent.valueDeltaMinor).toBeNull()
        expect(knownRestoreEvent.valueAfterMinor).toBeNull()
        expect(knownRestoreEvent.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
        expect(unknownReplacementEvent.sourceCostMinor).toBeNull()
        expect(unknownReplacementEvent.valueDeltaMinor).toBeNull()
        expect(unknownReplacementEvent.valueAfterMinor).toBeNull()
        expect(unknownReplacementEvent.unknownReason).toBe(
          "UNCAPTURED_MOVEMENTS",
        )
        const unknownAfterCostRestoration =
          await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: fullBalance.balanceSourceId,
              },
            },
          })
        expect(unknownAfterCostRestoration.valueMinor).toBeNull()
        expect(unknownAfterCostRestoration.unknownReason).toBe(
          "UNCAPTURED_MOVEMENTS",
        )

        const sharedMovement = unrelatedOrdinary.movements[0]
        if (!sharedMovement)
          throw new Error("Shared-pool withdrawal has no movement")
        const sharedEvent =
          await db.financeInventoryValuationEvent.findUniqueOrThrow({
            where: { stockMovementId: sharedMovement.id },
          })
        expect(sharedEvent.canonicalEffect.toFixed()).toBe("-12")
        expect(sharedMovement.enteredQuantity).toBe("1")
        expect(sharedMovement.unitFactorSnapshot).toBe("12")
        expect(sharedEvent.sourceCostMinor).toBe(BigInt(50))
        expect(sharedEvent.quantityBefore.toFixed()).toBe("24")
        expect(sharedEvent.quantityAfter.toFixed()).toBe("12")
        expect(sharedEvent.valueBeforeMinor).toBe(BigInt(101))
        expect(sharedEvent.valueAfterMinor).toBe(BigInt(51))

        const knownGainInput = ordinaryInput({
          balance: gainBalance,
          clientOperationId: `ordinary-stock-cost-known-pool-gain-${runId}`,
          direction: "increase",
          effectiveAt: new Date("2026-09-16T12:00:00.000Z"),
          enteredQuantity: "1",
          expectedBalanceRevision: 1,
          type: "receipt",
          unitCostMinor: 888,
        })
        const knownGain = await postSingleBalanceStockOperation(
          db,
          knownGainInput,
        )
        const gainMovement = knownGain.movements[0]
        if (!gainMovement) throw new Error("Ordinary gain has no movement")
        const gainEvent =
          await db.financeInventoryValuationEvent.findUniqueOrThrow({
            where: { stockMovementId: gainMovement.id },
          })
        expect(gainMovement.unitCostMinorSnapshot).toBe(888)
        expect(gainEvent).toMatchObject({
          sourceKind: "ORDINARY_STOCK_OPERATION",
          sourceCostMinor: null,
          valueBeforeMinor: BigInt(333),
          valueDeltaMinor: null,
          valueAfterMinor: null,
          unknownReason: "UNCAPTURED_MOVEMENTS",
        })
        const unknownGainPool = await db.financeInventoryPool.findUniqueOrThrow(
          {
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: gainBalance.balanceSourceId,
              },
            },
          },
        )
        expect(unknownGainPool.valueMinor).toBeNull()
        expect(unknownGainPool.unknownReason).toBe("UNCAPTURED_MOVEMENTS")

        const positiveCorrectionInput = correctionInput({
          correctedEnteredQuantity: "0.5",
          expectedBalanceRevision: 2,
          movementId: gainMovement.id,
          sourceOperationId: knownGain.id,
          clientOperationId: `ordinary-stock-cost-positive-correction-${runId}`,
        })
        const positiveCorrection = await correctStockOperation(
          db,
          positiveCorrectionInput,
        )
        expect(positiveCorrection.movements).toHaveLength(2)
        const positiveCorrectionEvents =
          await db.financeInventoryValuationEvent.findMany({
            where: {
              bookId: book.id,
              sourceKind: "ORDINARY_STOCK_CORRECTION",
              sourceId: positiveCorrection.id,
            },
            orderBy: { sequence: "asc" },
          })
        expect(positiveCorrectionEvents).toHaveLength(2)
        for (const event of positiveCorrectionEvents) {
          expect(event.sourceCostMinor).toBeNull()
          expect(event.valueDeltaMinor).toBeNull()
          expect(event.valueAfterMinor).toBeNull()
          expect(event.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
        }
        const unknownAfterPositiveCorrection =
          await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: gainBalance.balanceSourceId,
              },
            },
          })
        expect(unknownAfterPositiveCorrection.valueMinor).toBeNull()
        expect(unknownAfterPositiveCorrection.unknownReason).toBe(
          "UNCAPTURED_MOVEMENTS",
        )
        const unknownWithdrawal = await postSingleBalanceStockOperation(
          db,
          ordinaryInput({
            balance: gainBalance,
            clientOperationId: `ordinary-stock-cost-unknown-withdrawal-${runId}`,
            direction: "decrease",
            enteredQuantity: "0.25",
            expectedBalanceRevision: 3,
            type: "adjustment",
          }),
        )
        const unknownWithdrawalMovement = unknownWithdrawal.movements[0]
        if (!unknownWithdrawalMovement) {
          throw new Error("Unknown-pool withdrawal has no movement")
        }
        const unknownWithdrawalEvent =
          await db.financeInventoryValuationEvent.findUniqueOrThrow({
            where: { stockMovementId: unknownWithdrawalMovement.id },
          })
        expect(unknownWithdrawalEvent.sourceCostMinor).toBeNull()
        expect(unknownWithdrawalEvent.valueDeltaMinor).toBeNull()
        expect(unknownWithdrawalEvent.valueAfterMinor).toBeNull()
        expect(unknownWithdrawalEvent.unknownReason).toBe(
          "UNCAPTURED_MOVEMENTS",
        )

        const legacyPurchasePool =
          await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: legacyBalance.balanceSourceId,
              },
            },
          })
        const { legacyOperation, legacyMovement } = await db.$transaction(
          async (tx) => {
            const operation = await tx.stockOperation.create({
              data: {
                actorUserId: owner.id,
                clientOperationId: `ordinary-stock-cost-legacy-unregistered-${runId}`,
                effectiveAt: new Date("2026-09-16T12:00:00.000Z"),
                payloadHash: `legacy-${runId}`,
                reason:
                  "QA legacy movement without original valuation registration",
                source: "legacy_acceptance_fixture",
                storeId: store.id,
                tenantId: tenant.id,
                type: "ADJUSTMENT",
              },
            })
            const movement = await tx.stockMovement.create({
              data: {
                balanceSourceId: legacyBalance.balanceSourceId,
                configurationVersionId: legacyBalance.configurationVersionId,
                enteredInventoryUnitId: legacyBalance.enteredInventoryUnitId,
                enteredQuantity: "1",
                operationId: operation.id,
                previousOnHandQuantity: "2",
                resultingOnHandQuantity: "1",
                signedCanonicalEffect: "-12",
                transactionScaleSnapshot: caseTransactionScale,
                unitFactorSnapshot: caseUnitFactor,
              },
            })
            await tx.stockBalanceSource.update({
              where: { id: legacyBalance.balanceSourceId },
              data: { onHandQuantity: "1", revision: { increment: 1 } },
            })
            return { legacyOperation: operation, legacyMovement: movement }
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
        const legacyCorrection = await correctStockOperation(
          db,
          correctionInput({
            correctedEnteredQuantity: "0.5",
            expectedBalanceRevision: 2,
            movementId: legacyMovement.id,
            sourceOperationId: legacyOperation.id,
            clientOperationId: `ordinary-stock-cost-legacy-correction-${runId}`,
          }),
        )
        const legacyCorrectionEvents =
          await db.financeInventoryValuationEvent.findMany({
            where: {
              bookId: book.id,
              sourceKind: "ORDINARY_STOCK_CORRECTION",
              sourceId: legacyCorrection.id,
            },
          })
        expect(legacyCorrectionEvents).toHaveLength(2)
        for (const event of legacyCorrectionEvents) {
          expect(event.sourceCostMinor).toBeNull()
          expect(event.valueDeltaMinor).toBeNull()
          expect(event.valueAfterMinor).toBeNull()
          expect(event.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
        }
        const legacyPoolAfterCorrection =
          await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: legacyBalance.balanceSourceId,
              },
            },
          })
        expect(legacyPoolAfterCorrection.valueMinor).toBeNull()
        expect(legacyPoolAfterCorrection.unknownReason).toBe(
          "UNCAPTURED_MOVEMENTS",
        )
        expect(legacyPurchasePool.valueMinor).toBe(BigInt(1001))

        await expect(
          postSingleBalanceStockOperation(db, {
            ...ordinaryInput({
              balance: knownBalance,
              clientOperationId: `ordinary-stock-cost-foreign-${runId}`,
              direction: "decrease",
              enteredQuantity: "0.1",
              expectedBalanceRevision: 5,
              type: "adjustment",
            }),
            tenantId: foreignTenant.id,
          }),
        ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" })
        await expect(
          correctStockOperation(db, {
            ...correctionInput({
              correctedEnteredQuantity: "0.5",
              expectedBalanceRevision: 3,
              movementId: originalWithdrawalMovement.id,
              sourceOperationId: initialWithdrawal.id,
              clientOperationId: `ordinary-stock-cost-foreign-correction-${runId}`,
            }),
            tenantId: foreignTenant.id,
          }).then(() => {
            throw new Error("Foreign correction unexpectedly succeeded")
          }),
        ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })

        const foreignPoolCountBefore = await db.financeInventoryPool.count({
          where: { tenantId: foreignTenant.id },
        })
        const foreignEventCountBefore =
          await db.financeInventoryValuationEvent.count({
            where: { tenantId: foreignTenant.id },
          })
        const noBookIncrease = await postSingleBalanceStockOperation(db, {
          actorUserId: owner.id,
          balanceSourceId: noBookBalance.balanceSourceId,
          clientOperationId: `ordinary-stock-cost-no-book-${runId}`,
          direction: "increase",
          enteredInventoryUnitId: noBookBalance.enteredInventoryUnitId,
          enteredQuantity: "0.5",
          expectedBalanceRevision: 0,
          expectedConfigurationVersionId: noBookBalance.configurationVersionId,
          reason: "QA no-book ordinary stock increase",
          schemaVersion: 1,
          source: "ordinary_stock_cost_acceptance_no_book",
          storeId: noBookStore.id,
          tenantId: foreignTenant.id,
          type: "receipt",
          unitCostMinor: 1000,
        })
        expect(noBookIncrease.movements).toHaveLength(1)
        const noBookBalanceAfter =
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: noBookBalance.balanceSourceId },
          })
        expect(noBookBalanceAfter.onHandQuantity.toString()).toBe("0.5")
        expect(noBookBalanceAfter.revision).toBe(1)
        expect(
          await db.financeInventoryPool.count({
            where: { tenantId: foreignTenant.id },
          }),
        ).toBe(foreignPoolCountBefore)
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { tenantId: foreignTenant.id },
          }),
        ).toBe(foreignEventCountBefore)
        const noBookIncreaseMovement = noBookIncrease.movements[0]
        if (!noBookIncreaseMovement) {
          throw new Error("No-book ordinary increase has no movement")
        }
        const noBookCorrection = await correctStockOperation(db, {
          actorUserId: owner.id,
          clientOperationId: `ordinary-stock-cost-no-book-correction-${runId}`,
          corrections: [
            {
              correctedEnteredQuantity: "0.25",
              expectedBalanceRevision: 1,
              movementId: noBookIncreaseMovement.id,
            },
          ],
          reason: "QA no-book ordinary source correction",
          schemaVersion: 1,
          source: "ordinary_stock_cost_acceptance_no_book_correction",
          targetOperationId: noBookIncrease.id,
          tenantId: foreignTenant.id,
        })
        expect(noBookCorrection.movements).toHaveLength(2)
        expect(
          await db.stockOperation.findUniqueOrThrow({
            where: { id: noBookCorrection.id },
          }),
        ).toMatchObject({ correctionOfOperationId: noBookIncrease.id })
        const noBookInverse = noBookCorrection.movements.find(
          (movement) => movement.signedCanonicalEffect === "-6",
        )
        const noBookReplacement = noBookCorrection.movements.find(
          (movement) => movement.signedCanonicalEffect === "3",
        )
        if (!noBookInverse || !noBookReplacement) {
          throw new Error("No-book correction did not create its physical pair")
        }
        expect(
          (
            await db.stockMovement.findUniqueOrThrow({
              where: { id: noBookInverse.id },
            })
          ).reversalOfMovementId,
        ).toBe(noBookIncreaseMovement.id)
        expect(noBookInverse.previousOnHandQuantity).toBe("0.5")
        expect(noBookInverse.resultingOnHandQuantity).toBe("0")
        expect(noBookReplacement.previousOnHandQuantity).toBe("0")
        expect(noBookReplacement.resultingOnHandQuantity).toBe("0.25")
        const noBookBalanceAfterCorrection =
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: noBookBalance.balanceSourceId },
          })
        expect(noBookBalanceAfterCorrection.onHandQuantity.toString()).toBe(
          "0.25",
        )
        expect(noBookBalanceAfterCorrection.revision).toBe(2)
        expect(
          await db.financeInventoryPool.count({
            where: { tenantId: foreignTenant.id },
          }),
        ).toBe(foreignPoolCountBefore)
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { tenantId: foreignTenant.id },
          }),
        ).toBe(foreignEventCountBefore)
        expect(
          await db.financeJournalEntry.count({
            where: { book: { tenantId: foreignTenant.id } },
          }),
        ).toBe(0)
        expect(
          await db.financeBook.count({ where: { tenantId: foreignTenant.id } }),
        ).toBe(0)

        const ordinarySourceJournals = await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: {
              in: ["ORDINARY_STOCK_OPERATION", "ORDINARY_STOCK_CORRECTION"],
            },
          },
        })
        expect(ordinarySourceJournals).toBe(0)
      } finally {
        await db.$transaction(
          async (tx) => {
            if (cleanupBookId) {
              await tx.financeBook.updateMany({
                where: { id: cleanupBookId },
                data: { closedThrough: null },
              })
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
                where: {
                  tenantId: { in: tenantIds },
                  userId: { in: actorUserIds },
                },
              })
              await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
            }
            if (actorUserIds.length) {
              await tx.user.deleteMany({ where: { id: { in: actorUserIds } } })
            }
          },
          { maxWait: 10_000, timeout: 30_000 },
        )

        const [
          remainingTenants,
          remainingStores,
          remainingItems,
          remainingUsers,
          remainingBooks,
          remainingSuppliers,
          remainingBalances,
          remainingPools,
          remainingEvents,
          remainingReceipts,
          remainingBills,
          remainingBillLines,
          remainingSupplierEntries,
          remainingFinanceCommands,
          remainingJournalLines,
          remainingOperations,
          remainingMovements,
          remainingStockCategories,
          remainingCategoryNames,
          remainingJournals,
        ] = await Promise.all([
          db.tenant.count({ where: { id: { in: tenantIds } } }),
          db.store.count({ where: { id: { in: storeIds } } }),
          db.catalogItem.count({ where: { id: { in: catalogItemIds } } }),
          db.user.count({ where: { id: { in: actorUserIds } } }),
          cleanupBookId
            ? db.financeBook.count({ where: { id: cleanupBookId } })
            : Promise.resolve(0),
          supplierId
            ? db.financeSupplierAccount.count({ where: { id: supplierId } })
            : Promise.resolve(0),
          db.stockBalanceSource.count({
            where: { id: { in: balanceSourceIds } },
          }),
          cleanupBookId
            ? db.financeInventoryPool.count({
                where: { bookId: cleanupBookId },
              })
            : Promise.resolve(0),
          cleanupBookId
            ? db.financeInventoryValuationEvent.count({
                where: { bookId: cleanupBookId },
              })
            : Promise.resolve(0),
          cleanupBookId
            ? db.financePurchaseReceiptLine.count({
                where: { bookId: cleanupBookId },
              })
            : Promise.resolve(0),
          cleanupBookId
            ? db.financeBill.count({ where: { bookId: cleanupBookId } })
            : Promise.resolve(0),
          cleanupBookId
            ? db.financeBillLine.count({ where: { bookId: cleanupBookId } })
            : Promise.resolve(0),
          cleanupBookId
            ? db.financeSupplierEntry.count({
                where: { bookId: cleanupBookId },
              })
            : Promise.resolve(0),
          cleanupBookId
            ? db.financeCommand.count({ where: { bookId: cleanupBookId } })
            : Promise.resolve(0),
          cleanupBookId
            ? db.financeJournalLine.count({ where: { bookId: cleanupBookId } })
            : Promise.resolve(0),
          db.stockOperation.count({ where: { tenantId: { in: tenantIds } } }),
          db.stockMovement.count({
            where: { operation: { tenantId: { in: tenantIds } } },
          }),
          db.stockOperationCategory.count({
            where: { tenantId: { in: tenantIds } },
          }),
          db.stockOperationCategoryName.count({
            where: { tenantId: { in: tenantIds } },
          }),
          cleanupBookId
            ? db.financeJournalEntry.count({ where: { bookId: cleanupBookId } })
            : Promise.resolve(0),
        ])
        assertCleanup(remainingTenants === 0, "QA tenants remain after cleanup")
        assertCleanup(remainingStores === 0, "QA stores remain after cleanup")
        assertCleanup(
          remainingItems === 0,
          "QA Catalog Items remain after cleanup",
        )
        assertCleanup(remainingUsers === 0, "QA users remain after cleanup")
        assertCleanup(
          remainingBooks === 0,
          "QA Finance Book remains after cleanup",
        )
        assertCleanup(
          remainingSuppliers === 0,
          "QA supplier remains after cleanup",
        )
        assertCleanup(
          remainingBalances === 0,
          "QA stock balances remain after cleanup",
        )
        assertCleanup(
          remainingPools === 0,
          "QA valuation pools remain after cleanup",
        )
        assertCleanup(
          remainingEvents === 0,
          "QA valuation events remain after cleanup",
        )
        assertCleanup(
          remainingReceipts === 0,
          "QA purchase receipt links remain after cleanup",
        )
        assertCleanup(
          remainingBills === 0,
          "QA Finance Bills remain after cleanup",
        )
        assertCleanup(
          remainingBillLines === 0,
          "QA Finance Bill Lines remain after cleanup",
        )
        assertCleanup(
          remainingSupplierEntries === 0,
          "QA Finance Supplier Entries remain after cleanup",
        )
        assertCleanup(
          remainingFinanceCommands === 0,
          "QA Finance Commands remain after cleanup",
        )
        assertCleanup(
          remainingJournalLines === 0,
          "QA Finance Journal Lines remain after cleanup",
        )
        assertCleanup(
          remainingOperations === 0,
          "QA Stock Operations remain after cleanup",
        )
        assertCleanup(
          remainingMovements === 0,
          "QA Stock Movements remain after cleanup",
        )
        assertCleanup(
          remainingStockCategories === 0,
          "QA Stock Operation categories remain after cleanup",
        )
        assertCleanup(
          remainingCategoryNames === 0,
          "QA Stock Operation category names remain after cleanup",
        )
        assertCleanup(
          remainingJournals === 0,
          "QA Finance Journals remain after cleanup",
        )
      }
    })
  },
)
