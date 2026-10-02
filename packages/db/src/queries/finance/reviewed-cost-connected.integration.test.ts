import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createCatalogItem } from "../catalog"
import {
  createCommercialOrder,
  fulfillCommercialOrderProductLine,
  returnCommercialOrderProductLine,
} from "../commercial-orders"
import {
  createAndDispatchStockTransfer,
  receiveOrCancelStockTransfer,
} from "../inventory-custody-transfers"
import { postSingleBalanceStockOperation } from "../inventory-operations"
import { lockFinanceBook } from "./access"
import { createFinanceBook } from "./accounts"
import { cleanupConnectedCostAcceptance } from "./reviewed-cost-connected.integration-cleanup"
import { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import { readReviewedCostPhysicalHistoryInTransaction } from "./reviewed-cost-history"
import { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"
import { readReviewedCostConnectedHistoryInTransaction } from "./reviewed-cost-snapshot"

setDefaultTimeout(600_000)
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error("Connected cost acceptance requires exact development.")
}

describeWithServiceCommerceDatabase(
  "complete cost reference discovery branches",
  () => {
    test("retains transfer stages, nonphysical returns and both directions of review dependencies", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      console.info(`connected-cost QA run ${runId}`)
      const tenantIds: string[] = []
      const userIds: string[] = []
      const bookIds: string[] = []
      try {
        const owner = await db.user.create({
          data: {
            name: "Connected cost QA",
            email: `opening-cost-${runId}@example.invalid`,
          },
        })
        userIds.push(owner.id)
        const tenant = await db.tenant.create({
          data: {
            name: "Connected cost QA",
            slug: `opening-cost-connected-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(tenant.id)
        const actor = { tenantId: tenant.id, actorUserId: owner.id }
        const stores = []
        for (const label of ["source", "target", "independent"]) {
          stores.push(
            await db.store.create({
              data: {
                tenantId: tenant.id,
                name: `Private ${label} cost QA`,
                slug: `connected-${label}-${runId}`,
                countryCode: "NG",
                status: "ACTIVE",
              },
            }),
          )
        }
        const [sourceStore, targetStore, independentStore] = stores
        if (!sourceStore || !targetStore || !independentStore)
          throw new Error("Missing QA stores")
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        bookIds.push(book.id)
        const item = await createCatalogItem(db, {
          ...actor,
          storeId: sourceStore.id,
          clientOperationId: `connected-original-${runId}`,
          kind: "product",
          name: "Connected original",
          unitConfiguration: {
            canonicalBalanceScale: 18,
            units: [
              {
                key: "base",
                name: "unit",
                stockBehavior: "canonical_shared",
                transactionScale: 3,
                factor: "1",
              },
            ],
          },
          variants: [
            {
              key: "default",
              name: "Default",
              isDefault: true,
              openingStockQuantity: "8",
              offerings: [
                {
                  key: "one",
                  name: "One unit",
                  fixedPriceMinor: 5000,
                  pricingPolicy: "fixed",
                  inventoryUnitKey: "base",
                },
              ],
            },
          ],
        })
        const initial = item.product?.stockBalances[0]
        if (!initial) throw new Error("Missing original balance")
        const source = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: initial.id },
          include: { inventoryUnit: true },
        })
        const transfer = await createAndDispatchStockTransfer(db, {
          ...actor,
          clientOperationId: `connected-dispatch-${runId}`,
          clientTransferId: `connected-transfer-${runId}`,
          expectedSourceRevision: source.revision,
          quantity: "2",
          reason: "QA real transfer",
          schemaVersion: 1,
          source: "QA_CONNECTED_TRANSFER",
          sourceBalanceSourceId: source.id,
          targetStoreId: targetStore.id,
        })
        if (!transfer.transitBalanceSourceId)
          throw new Error("Missing transit balance")
        const transit = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: transfer.transitBalanceSourceId },
        })
        const received = await receiveOrCancelStockTransfer(db, {
          ...actor,
          clientOperationId: `connected-receive-${runId}`,
          expectedTransitRevision: transit.revision,
          reason: "QA actual receive",
          schemaVersion: 1,
          source: "QA_CONNECTED_RECEIVE",
          transferId: transfer.id,
          transition: "receive",
        })
        const target = await db.stockBalanceSource.findFirstOrThrow({
          where: {
            tenantId: tenant.id,
            storeId: targetStore.id,
            variantId: source.variantId,
            inventoryUnitId: source.inventoryUnitId,
            custodyType: "STORE",
          },
        })
        const offering = await db.sellableOffering.findFirstOrThrow({
          where: { variantId: source.variantId, kind: "PRODUCT_UNIT" },
        })
        const current = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: source.id },
        })
        const order = await createCommercialOrder(db, {
          ...actor,
          storeId: sourceStore.id,
          clientOrderId: `connected-order-${runId}`,
          schemaVersion: 1,
          lines: [
            {
              offeringId: offering.id,
              quantity: "2",
              expectedBalanceRevision: current.revision,
              expectedConfigurationVersionId:
                source.inventoryUnit.configurationVersionId,
            },
          ],
        })
        const line = await db.commercialOrderLine.findFirstOrThrow({
          where: { orderId: order.id },
        })
        await fulfillCommercialOrderProductLine(db, {
          ...actor,
          orderLineId: line.id,
          clientOperationId: `connected-fulfill-${runId}`,
          schemaVersion: 1,
        })
        const returned = await returnCommercialOrderProductLine(db, {
          ...actor,
          clientReturnId: `connected-no-restock-${runId}`,
          disposition: "no_restock",
          orderLineId: line.id,
          quantity: "0.5",
          reason: "QA actual nonphysical return",
          schemaVersion: 1,
        })
        expect(returned.stockOperationId).toBeNull()
        expect(returned.destinationBalanceSourceId).toBeNull()
        const originalIssue =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: {
              bookId: book.id,
              sourceKind: "PRODUCT_FULFILLMENT",
              balanceSourceId: source.id,
            },
          })
        const returnCost = await db.financeProductReturnCost.findUniqueOrThrow({
          where: { productReturnId: returned.id },
          include: { allocations: true },
        })
        expect(returnCost.allocations).toHaveLength(1)
        expect(returnCost.allocations[0]?.originalIssueId).toBe(
          originalIssue.id,
        )
        const input = {
          ...actor,
          bookId: book.id,
          balanceSourceIds: [target.id],
        }
        const options = { maxWait: 10_000, timeout: 30_000 }
        const read = (roots = input.balanceSourceIds) =>
          db.$transaction(
            (tx) =>
              discoverReviewedCostSourcesInTransaction(tx, {
                ...input,
                balanceSourceIds: roots,
              }),
            options,
          )
        const first = await read()
        expect(first.balanceSourceIds).toEqual(
          [source.id, transit.id, target.id].sort(),
        )
        expect(first.transferIds).toEqual([transfer.id])
        expect(first.orderLineIds).toEqual([line.id])
        expect(first.productReturnIds).toEqual([returned.id])
        const dispatchedId = transfer.dispatchedOperationId
        const receivedId = received.receivedOperationId
        if (!dispatchedId || !receivedId)
          throw new Error("Missing actual transfer stages")
        expect(first.operationIds).toContain(dispatchedId)
        expect(first.operationIds).toContain(receivedId)
        expect(first.movementIds).toHaveLength(6)
        const physical = await db.$transaction(
          (tx) =>
            readReviewedCostPhysicalHistoryInTransaction(tx, {
              ...input,
              balanceSourceIds: first.balanceSourceIds,
              through: new Date(),
            }),
          options,
        )
        expect(
          physical.balances.every((row) => row.physicalQuantityReconciled),
        ).toBe(true)
        expect(
          physical.balances.reduce((n, row) => n + row.movements.length, 0),
        ).toBe(6)
        const independent = await db.stockBalanceSource.create({
          data: {
            tenantId: tenant.id,
            storeId: independentStore.id,
            productId: source.productId,
            variantId: source.variantId,
            inventoryUnitId: source.inventoryUnitId,
            kind: "SHARED_POOL",
          },
        })
        await postSingleBalanceStockOperation(db, {
          ...actor,
          storeId: independentStore.id,
          balanceSourceId: independent.id,
          clientOperationId: `connected-independent-${runId}`,
          direction: "increase",
          type: "receipt",
          enteredInventoryUnitId: source.inventoryUnitId,
          enteredQuantity: "3",
          expectedBalanceRevision: 0,
          expectedConfigurationVersionId:
            source.inventoryUnit.configurationVersionId,
          reason: "QA independent receipt; no monetary authority",
          schemaVersion: 1,
          source: "QA_CONNECTED_INDEPENDENT",
        })
        const draft = await db.stockTransfer.create({
          data: {
            tenantId: tenant.id,
            sourceStoreId: sourceStore.id,
            targetStoreId: independentStore.id,
            sourceBalanceSourceId: source.id,
            clientTransferId: `connected-draft-${runId}`,
            payloadHash: "a".repeat(64),
            inventoryUnitId: source.inventoryUnitId,
            configurationVersionId: source.inventoryUnit.configurationVersionId,
            enteredQuantity: "1",
            unitFactorSnapshot: "1",
            canonicalQuantity: "1",
            stockBehaviorSnapshot: "CANONICAL_SHARED",
            createdByUserId: owner.id,
          },
        })
        const stillIndependent = await read()
        expect(stillIndependent.balanceSourceIds).not.toContain(independent.id)
        expect(stillIndependent.transferIds).not.toContain(draft.id)
        const opening =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: {
              bookId: book.id,
              balanceSourceId: source.id,
              kind: "OPENING",
            },
          })
        const independentEvent =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { bookId: book.id, balanceSourceId: independent.id },
          })
        // These rows probe typed monetary reference discovery only. They are not
        // confirmed reviews: no evidence, command/result, pool write or journal.
        function reviewData(
          label: string,
        ): Prisma.FinanceInventoryCostReviewUncheckedCreateInput {
          return {
            tenantId: tenant.id,
            bookId: book.id,
            clientCommandId: `connected-review-${label}-${runId}`,
            payloadHash: "a".repeat(64),
            costTraceHash: "b".repeat(64),
            reviewedSnapshotHash: "c".repeat(64),
            algorithmVersion: "weighted-average-original-return-v1",
            evidenceCutoff: new Date(),
            historyThrough: new Date(),
            reviewedBookSequence: 0n,
            reason: "QA-only reference discovery",
            sourceSnapshot: { qaOnly: true, runId },
            postingPlan: [],
            actorUserId: owner.id,
          }
        }
        const review = await db.financeInventoryCostReview.create({
          data: reviewData("first"),
        })
        const nextReview = await db.financeInventoryCostReview.create({
          data: reviewData("next"),
        })
        function allocationData(
          event: typeof opening,
          reviewId: string,
        ): Prisma.FinanceInventoryCostReviewAllocationUncheckedCreateInput {
          return {
            tenantId: tenant.id,
            bookId: book.id,
            reviewId,
            poolId: event.poolId,
            balanceSourceId: event.balanceSourceId,
            sourceKey: `movement:${event.stockMovementId}`,
            kind: "ORIGIN",
            ordinal: 1n,
            effectiveAt: event.effectiveAt,
            quantity: event.canonicalEffect,
            quantityBefore: event.quantityBefore,
            quantityAfter: event.quantityAfter,
            recordedCostMinor: event.sourceCostMinor,
            resolvedCostMinor: 100n,
            valuationEventId: event.id,
            stockOperationId: event.stockOperationId,
            stockMovementId: event.stockMovementId,
          }
        }
        const original = await db.financeInventoryCostReviewAllocation.create({
          data: allocationData(opening, review.id),
        })
        const dependent = await db.financeInventoryCostReviewAllocation.create({
          data: {
            ...allocationData(independentEvent, review.id),
            kind: "TRANSFER_IN",
            originalSourceKey: original.sourceKey,
          },
        })
        const latest = await db.financeInventoryCostReviewAllocation.create({
          data: {
            ...allocationData(independentEvent, nextReview.id),
            previousResolutionId: dependent.id,
          },
        })
        const forward = await read()
        expect(forward.balanceSourceIds).toContain(independent.id)
        expect(forward.reviewAllocationIds).toEqual(
          [original.id, dependent.id, latest.id].sort(),
        )
        expect(forward.movementIds).toHaveLength(7)
        expect(forward.sourceDiscoveryHash).not.toBe(first.sourceDiscoveryHash)
        const backward = await read([independent.id])
        expect(backward.balanceSourceIds).toEqual(forward.balanceSourceIds)
        expect(backward.reviewAllocationIds).toEqual(
          forward.reviewAllocationIds,
        )
        expect(backward.productReturnIds).toEqual([returned.id])
        expect(forward.requiresOwningSourceProof).toBe(true)
        expect(forward.requiresMonetaryProof).toBe(true)
        // Isolate the reverse original-issue -> return-allocation edge. The QA
        // fulfillment link is deliberately invalidated and rolled back; discovery
        // must retain the recorded cost relation for the later semantic audit.
        const fulfillment = await db.productFulfillment.findFirstOrThrow({
          where: { orderLineId: line.id },
        })
        const rollback = new Error("QA reverse return relation rollback")
        await expect(
          db.$transaction(async (tx) => {
            await lockFinanceBook(tx, input)
            const detached = await tx.stockOperation.create({
              data: {
                tenantId: tenant.id,
                storeId: sourceStore.id,
                type: "ADJUSTMENT",
                actorUserId: owner.id,
                clientOperationId: `connected-detached-${runId}`,
                payloadHash: "d".repeat(64),
                source: "QA_DETACHED_REFERENCE",
              },
            })
            await tx.productFulfillment.update({
              where: { id: fulfillment.id },
              data: { stockOperationId: detached.id },
            })
            const complete = await discoverReviewedCostSourcesInTransaction(
              tx,
              input,
            )
            expect(complete.productReturnIds).toContain(returned.id)
            expect(complete.operationIds).toContain(detached.id)
            throw rollback
          }, options),
        ).rejects.toBe(rollback)
        expect((await read()).sourceDiscoveryHash).toBe(
          forward.sourceDiscoveryHash,
        )
        expect(
          await db.financeJournalEntry.count({ where: { bookId: book.id } }),
        ).toBe(0)
        const returnInput = {
          ...actor,
          bookId: book.id,
          orderLineIds: [line.id],
        }
        const readReturns = () =>
          db.$transaction(
            (tx) => readReviewedCostReturnsInTransaction(tx, returnInput),
            options,
          )
        const originalReturns = await readReturns()
        expect(
          originalReturns.snapshot.budgets[0]?.returnedCanonicalQuantity,
        ).toBe("0.5")
        expect(
          originalReturns.snapshot.budgets[0]?.remaining[0]?.remainingQuantity,
        ).toBe("1.5")
        expect(
          originalReturns.snapshot.budgets[0]?.remaining[0]?.remainingCostMinor,
        ).toBeNull()
        expect(originalReturns.requiresPhysicalHistoryProof).toBe(true)
        expect(originalReturns.requiresMonetaryProof).toBe(true)
        expect(originalReturns.requiresPostedJournalProof).toBe(true)
        expect((await readReturns()).sourceSnapshotHash).toBe(
          originalReturns.sourceSnapshotHash,
        )
        await returnCommercialOrderProductLine(db, {
          ...actor,
          clientReturnId: `connected-restock-budget-${runId}`,
          disposition: "restock",
          destinationBalanceSourceId: source.id,
          orderLineId: line.id,
          quantity: "0.5",
          reason: "QA actual restock budget",
          schemaVersion: 1,
        })
        await returnCommercialOrderProductLine(db, {
          ...actor,
          clientReturnId: `connected-final-budget-${runId}`,
          disposition: "damaged",
          orderLineId: line.id,
          quantity: "0.5",
          reason: "QA actual damaged nonphysical budget",
          schemaVersion: 1,
        })
        await returnCommercialOrderProductLine(db, {
          ...actor,
          clientReturnId: `connected-quarantine-budget-${runId}`,
          disposition: "quarantine",
          orderLineId: line.id,
          quantity: "0.5",
          reason: "QA actual quarantine nonphysical budget",
          schemaVersion: 1,
        })
        const completeReturns = await readReturns()
        expect(completeReturns.returns).toHaveLength(4)
        expect(completeReturns.allocations).toHaveLength(4)
        expect(
          completeReturns.returns.map((row) => row.disposition).sort(),
        ).toEqual(["DAMAGED", "NO_RESTOCK", "QUARANTINE", "RESTOCK"])
        expect(
          completeReturns.snapshot.budgets[0]?.returnedCanonicalQuantity,
        ).toBe("2")
        expect(
          completeReturns.snapshot.budgets[0]?.remaining[0]?.remainingQuantity,
        ).toBe("0")
        expect(
          completeReturns.snapshot.budgets[0]?.remaining[0]?.remainingCostMinor,
        ).toBeNull()
        expect(completeReturns.sourceSnapshotHash).not.toBe(
          originalReturns.sourceSnapshotHash,
        )
        const firstAllocation = returnCost.allocations[0]
        if (!firstAllocation)
          throw new Error("Missing actual return allocation")
        await expect(
          db.$transaction(async (tx) => {
            await lockFinanceBook(tx, returnInput)
            await tx.financeProductReturnCostAllocation.update({
              where: { id: firstAllocation.id },
              data: { remainingQuantityBefore: "9" },
            })
            await readReviewedCostReturnsInTransaction(tx, returnInput)
          }, options),
        ).rejects.toThrow("allocation chain")
        expect((await readReturns()).sourceSnapshotHash).toBe(
          completeReturns.sourceSnapshotHash,
        )
        await expect(
          db.$transaction(async (tx) => {
            await lockFinanceBook(tx, returnInput)
            await tx.productFulfillment.update({
              where: { id: fulfillment.id },
              data: { quantity: "1" },
            })
            await readReviewedCostReturnsInTransaction(tx, returnInput)
          }, options),
        ).rejects.toThrow("fulfillment/issue provenance")
        expect((await readReturns()).sourceSnapshotHash).toBe(
          completeReturns.sourceSnapshotHash,
        )
        await expect(
          db.$transaction(async (tx) => {
            await lockFinanceBook(tx, returnInput)
            await tx.financeProductReturnCostAllocation.deleteMany({
              where: { returnCostId: returnCost.id },
            })
            await tx.financeProductReturnCost.delete({
              where: { id: returnCost.id },
            })
            await readReviewedCostReturnsInTransaction(tx, returnInput)
          }, options),
        ).rejects.toThrow("legacy evidence")
        expect((await readReturns()).sourceSnapshotHash).toBe(
          completeReturns.sourceSnapshotHash,
        )
        const snapshotInput = { ...input, through: new Date() }
        const readSnapshot = () =>
          db.$transaction(
            (tx) =>
              readReviewedCostConnectedHistoryInTransaction(tx, snapshotInput),
            options,
          )
        const connectedSnapshot = await readSnapshot()
        expect(connectedSnapshot.discovery.balanceSourceIds).toEqual(
          [source.id, transit.id, target.id, independent.id].sort(),
        )
        expect(connectedSnapshot.returns.snapshot.returns).toHaveLength(4)
        expect(connectedSnapshot.returns.sourceSnapshotHash).toBe(
          completeReturns.sourceSnapshotHash,
        )
        expect(connectedSnapshot.requiresOwningSourceProof).toBe(true)
        expect(connectedSnapshot.requiresMonetaryProof).toBe(true)
        expect(connectedSnapshot.requiresPostedJournalProof).toBe(true)
        expect(connectedSnapshot.requiresPriorReviewProof).toBe(true)
        expect((await readSnapshot()).connectedSnapshotHash).toBe(
          connectedSnapshot.connectedSnapshotHash,
        )
        for (const drift of ["discovery", "nonphysical"] as const) {
          let stockLocks = 0
          let orderLocks = 0
          await expect(
            db.$transaction(async (tx) => {
              // Inject actual source changes between the initial source read and
              // stock-protected revalidation, then require transaction rollback.
              const observed = new Proxy(tx, {
                get(target, property, receiver) {
                  if (property !== "$queryRaw")
                    return Reflect.get(target, property, receiver)
                  return async (...args: unknown[]) => {
                    const query = Array.isArray(args[0]) ? args[0].join("") : ""
                    const result = await Reflect.apply(
                      target.$queryRaw,
                      target,
                      args,
                    )
                    if (
                      query.includes('"CommercialOrder"') &&
                      query.includes("FOR SHARE")
                    )
                      orderLocks++
                    if (
                      query.includes('"StockBalanceSource"') &&
                      query.includes("FOR SHARE")
                    ) {
                      stockLocks++
                      if (drift === "nonphysical") {
                        await tx.commercialOrder.update({
                          where: { id: order.id },
                          data: {
                            completedAt: new Date("2026-02-01T00:00:00Z"),
                          },
                        })
                      } else {
                        const detached = await tx.stockOperation.create({
                          data: {
                            tenantId: tenant.id,
                            storeId: sourceStore.id,
                            type: "ADJUSTMENT",
                            actorUserId: owner.id,
                            clientOperationId: `snapshot-drift-${runId}`,
                            payloadHash: "e".repeat(64),
                            source: "QA_SNAPSHOT_DRIFT",
                          },
                        })
                        await tx.stockOperation.update({
                          where: { id: dispatchedId },
                          data: { linkedOperationId: detached.id },
                        })
                      }
                    }
                    return result
                  }
                },
              })
              await readReviewedCostConnectedHistoryInTransaction(
                observed,
                snapshotInput,
              )
            }, options),
          ).rejects.toThrow(
            drift === "discovery"
              ? "discovery changed"
              : "return facts changed",
          )
          expect(stockLocks).toBe(1)
          expect(orderLocks).toBe(drift === "discovery" ? 1 : 2)
          expect((await readSnapshot()).connectedSnapshotHash).toBe(
            connectedSnapshot.connectedSnapshotHash,
          )
        }
        expect(
          await db.financeJournalEntry.count({ where: { bookId: book.id } }),
        ).toBe(0)
        console.info(`connected-cost checks complete ${runId}`)
      } finally {
        const remaining = await cleanupConnectedCostAcceptance(db, {
          runId,
          tenantIds,
          userIds,
          bookIds,
        })
        expect(remaining).toHaveLength(31)
        expect(remaining.every((count) => count === 0)).toBe(true)
        console.info(
          `connected-cost cleanup complete ${runId}: 31 absence checks clear`,
        )
      }
    })
  },
)
