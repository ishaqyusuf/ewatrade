import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
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
import {
  createStockCount,
  finalizeStockCount,
  postSingleBalanceStockOperation,
} from "../inventory-operations"
import { createFinanceBook } from "./accounts"
import { recordFinancePurchase } from "./purchases"
import { cleanupConnectedCostAcceptance } from "./reviewed-cost-connected.integration-cleanup"
import { readReviewedCostSourceAssemblyInTransaction } from "./reviewed-cost-source-assembly"
import { previewReviewedInventoryCostTrace } from "./reviewed-cost-trace"
import { createFinanceSupplier } from "./supplier-writes"

setDefaultTimeout(600_000)
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error("Source assembly acceptance requires exact development.")
}

describeWithServiceCommerceDatabase(
  "repository original source assembly",
  () => {
    test("assembles actual source owners and blocks incomplete components without a partial graph", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const began = Date.now()
      const stage = (label: string) =>
        console.info(
          `source-assembly ${runId}: ${label}, ${Date.now() - began}ms`,
        )
      console.info(`source-assembly QA run ${runId}`)
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
        for (const label of ["source", "target"]) {
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
        const [sourceStore, targetStore] = stores
        if (!sourceStore || !targetStore) throw new Error("Missing QA stores")
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        bookIds.push(book.id)
        stage("Catalog command starts")
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
        stage("Catalog opening complete")
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
        stage("Dispatch complete; receive starts")
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
        stage("Receive complete")
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
        stage("Product fulfillment complete")
        stage("Nonphysical return starts")
        await returnCommercialOrderProductLine(db, {
          ...actor,
          clientReturnId: `connected-no-restock-${runId}`,
          disposition: "no_restock",
          orderLineId: line.id,
          quantity: "0.5",
          reason: "QA actual nonphysical return",
          schemaVersion: 1,
        })

        stage("Nonphysical return complete; restock starts")
        await returnCommercialOrderProductLine(db, {
          ...actor,
          clientReturnId: `source-restock-${runId}`,
          disposition: "restock",
          orderLineId: line.id,
          quantity: "0.5",
          reason: "QA original physical recovery",
          schemaVersion: 1,
        })
        stage("Restock complete")
        const purchaseBalance = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: source.id },
        })
        const supplier = await createFinanceSupplier(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `source-supplier-${runId}`,
          code: `QA-${runId.slice(0, 8)}`,
          name: "Private source supplier",
        })
        stage("Purchase command starts")
        await recordFinancePurchase(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `source-purchase-${runId}`,
          supplierId: supplier.id,
          storeId: sourceStore.id,
          description: "Private original acquisition",
          incurredAt: new Date(),
          lines: [
            {
              balanceSourceId: source.id,
              description: "Private receipt",
              amountMinor: "100",
              enteredQuantity: "2",
              enteredInventoryUnitId: source.inventoryUnitId,
              expectedBalanceRevision: purchaseBalance.revision,
              expectedConfigurationVersionId:
                source.inventoryUnit.configurationVersionId,
              categories: [{ name: `Source assembly ${runId.slice(0, 8)}` }],
            },
          ],
        })
        stage("Purchase complete; composed reader starts")
        const input = {
          ...actor,
          bookId: book.id,
          balanceSourceIds: [target.id],
          through: new Date(),
        }
        const options = { maxWait: 10_000, timeout: 30_000 }
        let readNumber = 0
        const read = async () => {
          const traced = readNumber++ === 0
          const queries: Array<{ step: string; ms: number }> = []
          const invoke = async (
            method: (...args: unknown[]) => unknown,
            target: unknown,
            args: unknown[],
            step: string,
          ) => {
            const record = { step, ms: 0 }
            queries.push(record)
            if (queries.length > 80) queries.shift()
            const began = Date.now()
            try {
              return await Reflect.apply(method, target, args)
            } finally {
              record.ms = Date.now() - began
            }
          }
          try {
            return await db.$transaction((tx) => {
              if (!traced)
                return readReviewedCostSourceAssemblyInTransaction(tx, input)
              const observed = new Proxy(tx, {
                get(target, property, receiver) {
                  const value = Reflect.get(target, property, receiver)
                  if (property === "$queryRaw")
                    return (...args: unknown[]) => {
                      const query = Array.isArray(args[0])
                        ? args[0].join("")
                        : ""
                      const label = query.includes("WITH lines AS")
                        ? "return-fence"
                        : query.includes("WITH RECURSIVE")
                          ? "discovery"
                          : (/"(FinanceBook|Membership|StockOperation|StockBalanceSource|CommercialOrder)"/.exec(
                              query,
                            )?.[1] ?? "raw")
                      return invoke(value, target, args, label)
                    }
                  if (
                    typeof property !== "string" ||
                    property.startsWith("$") ||
                    !value ||
                    typeof value !== "object"
                  )
                    return value
                  return new Proxy(value, {
                    get(model, method, modelReceiver) {
                      const fn = Reflect.get(model, method, modelReceiver)
                      if (
                        typeof fn !== "function" ||
                        ![
                          "findUnique",
                          "findFirst",
                          "findMany",
                          "groupBy",
                          "count",
                        ].includes(String(method))
                      )
                        return fn
                      return (...args: unknown[]) =>
                        invoke(fn, model, args, `${property}.${String(method)}`)
                    },
                  })
                },
              })
              return readReviewedCostSourceAssemblyInTransaction(
                observed,
                input,
              )
            }, options)
          } finally {
            if (traced)
              console.info(
                `source-assembly ${runId}: final read query timings ${JSON.stringify(queries)}`,
              )
          }
        }
        stage("First composed read starts")
        const original = await read()
        stage("First composed read complete")
        expect(original.canAssemble).toBe(true)
        expect(original.blockers).toEqual([])
        const assembly = original.assembly
        if (!assembly) throw new Error("Missing complete original assembly")
        expect(assembly.pools).toHaveLength(3)
        expect(assembly.nodes).toHaveLength(9)
        expect(
          assembly.nodes.filter((row) => row.kind === "ORIGIN"),
        ).toHaveLength(2)
        expect(
          assembly.nodes.filter((row) => row.kind === "TRANSFER_OUT"),
        ).toHaveLength(2)
        expect(
          assembly.nodes.filter((row) => row.kind === "TRANSFER_IN"),
        ).toHaveLength(2)
        expect(
          assembly.nodes.filter((row) => row.kind === "RETURN_NON_RESTOCK"),
        ).toHaveLength(1)
        expect(
          assembly.nodes.filter((row) => row.kind === "RETURN_RESTOCK"),
        ).toHaveLength(1)
        expect(
          assembly.nodes.find((row) => row.kind === "WITHDRAWAL")?.kind,
        ).toBe("WITHDRAWAL")
        const preview = previewReviewedInventoryCostTrace({
          tenantId: actor.tenantId,
          bookId: book.id,
          currencyCode: "NGN",
          through: input.through,
          pools: assembly.pools,
          nodes: assembly.nodes,
          evidence: [],
          now: new Date(),
        })
        expect(
          preview.allocations.find(
            (row) =>
              row.node.kind === "ORIGIN" && row.recordedCostMinor === 100n,
          )?.resolvedCostMinor,
        ).toBe(100n)
        expect(preview.missingOriginEventIds).toHaveLength(1)
        expect(original.requiresMonetaryProof).toBe(true)
        expect(original.requiresClassificationProof).toBe(true)
        expect(original.requiresConfirmationProof).toBe(true)
        expect((await read()).sourceSnapshotHash).toBe(
          original.sourceSnapshotHash,
        )

        // The batched scope read must retain a changed connected Store currency.
        await expect(
          db.$transaction(async (tx) => {
            await tx.store.update({
              where: { id: targetStore.id },
              data: { currencyCode: "USD" },
            })
            return readReviewedCostSourceAssemblyInTransaction(tx, input)
          }, options),
        ).rejects.toThrow("missing, crossed or use an unsupported currency")

        // A scoped schema pointer is not proof of an accepted monetary overlay.
        await expect(
          db.$transaction(async (tx) => {
            const review = await tx.financeInventoryCostReview.create({
              data: {
                tenantId: tenant.id,
                bookId: book.id,
                clientCommandId: `source-prior-probe-${runId}`,
                payloadHash: "a".repeat(64),
                costTraceHash: "b".repeat(64),
                reviewedSnapshotHash: "c".repeat(64),
                algorithmVersion: "weighted-average-original-return-v1",
                evidenceCutoff: new Date(),
                historyThrough: input.through,
                reviewedBookSequence: 1n,
                reason: "QA unproved pointer probe",
                sourceSnapshot: { qaOnly: true, runId },
                postingPlan: [],
                actorUserId: owner.id,
              },
            })
            const pool = await tx.financeInventoryPool.findUniqueOrThrow({
              where: {
                bookId_balanceSourceId: {
                  bookId: book.id,
                  balanceSourceId: source.id,
                },
              },
            })
            const poolSnapshot = await tx.financeInventoryCostReviewPool.create(
              {
                data: {
                  tenantId: tenant.id,
                  bookId: book.id,
                  reviewId: review.id,
                  poolId: pool.id,
                  balanceSourceId: source.id,
                  quantity: pool.quantity,
                  valueBeforeMinor: pool.valueMinor,
                  valueAfterMinor: 0n,
                  expectedStockRevision: pool.lastStockRevision,
                  expectedMovementCount: pool.lastMovementCount,
                  expectedValuationSequence: pool.lastSequence,
                },
              },
            )
            await tx.financeInventoryPool.updateMany({
              where: { bookId: book.id, balanceSourceId: source.id },
              data: { lastCostReviewSnapshotId: poolSnapshot.id },
            })
            const pending = await readReviewedCostSourceAssemblyInTransaction(
              tx,
              input,
            )
            expect(pending.canAssemble).toBe(false)
            expect(pending.assembly).toBeNull()
            expect(pending.blockers).toContainEqual({
              code: "PRIOR_REVIEW_PENDING",
              sourceId: poolSnapshot.id,
            })
            throw new Error("ROLLBACK_PRIOR_POINTER_PROBE")
          }, options),
        ).rejects.toThrow("ROLLBACK_PRIOR_POINTER_PROBE")
        expect((await read()).sourceSnapshotHash).toBe(
          original.sourceSnapshotHash,
        )

        stage("Prior pointer/rollback checks complete")
        let stockLocks = 0
        let orderLocks = 0
        await expect(
          db.$transaction(async (tx) => {
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
                    await tx.stockOperation.update({
                      where: { id: transfer.dispatchedOperationId ?? "" },
                      data: { reason: "QA changed original owner facts" },
                    })
                  }
                  return result
                }
              },
            })
            await readReviewedCostSourceAssemblyInTransaction(observed, input)
          }, options),
        ).rejects.toThrow("Original owning-source facts changed")
        expect(stockLocks).toBe(1)
        expect(orderLocks).toBe(1)
        expect((await read()).sourceSnapshotHash).toBe(
          original.sourceSnapshotHash,
        )

        stage("Drift/rollback checks complete")
        // Actual ordinary withdrawal/gain sources retain their own unclassified semantics.
        const before = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: source.id },
        })
        const ordinary = await postSingleBalanceStockOperation(db, {
          ...actor,
          storeId: sourceStore.id,
          balanceSourceId: source.id,
          enteredInventoryUnitId: source.inventoryUnitId,
          enteredQuantity: "1",
          expectedConfigurationVersionId:
            source.inventoryUnit.configurationVersionId,
          expectedBalanceRevision: before.revision,
          clientOperationId: `source-ordinary-${runId}`,
          categories: [{ name: "QA ordinary source" }],
          source: "QA_ORDINARY_SOURCE",
          schemaVersion: 1,
          type: "adjustment",
          direction: "decrease",
          reason: "QA ordinary withdrawal requiring classification",
        })
        const afterWithdrawal = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: source.id },
        })
        const gain = await postSingleBalanceStockOperation(db, {
          ...actor,
          storeId: sourceStore.id,
          balanceSourceId: source.id,
          enteredInventoryUnitId: source.inventoryUnitId,
          enteredQuantity: "1",
          expectedConfigurationVersionId:
            source.inventoryUnit.configurationVersionId,
          expectedBalanceRevision: afterWithdrawal.revision,
          clientOperationId: `source-gain-${runId}`,
          categories: [{ name: "QA unknown gain source" }],
          source: "QA_ORDINARY_GAIN",
          schemaVersion: 1,
          type: "adjustment",
          direction: "increase",
          reason: "QA gain without monetary evidence",
        })
        const lateInput = { ...input, through: new Date() }
        const readLate = () =>
          db.$transaction(
            (tx) => readReviewedCostSourceAssemblyInTransaction(tx, lateInput),
            options,
          )
        stage("Ordinary withdrawal/gain read starts")
        const extended = await readLate()
        expect(extended.canAssemble).toBe(true)
        expect(extended.blockers).toEqual([])
        const extendedAssembly = extended.assembly
        if (!extendedAssembly)
          throw new Error("Missing ordinary source assembly")
        expect(extendedAssembly.nodes).toHaveLength(11)
        expect(
          extendedAssembly.nodes.filter(
            (node) => node.kind === "WITHDRAWAL" && node.purpose === "ORDINARY",
          ),
        ).toHaveLength(1)
        const gainEvent =
          await db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { stockOperationId: gain.id, bookId: book.id },
          })
        const gainNode = extendedAssembly.nodes.find(
          (node) => node.id === `movement:${gainEvent.stockMovementId}`,
        )
        expect(gainNode?.kind).toBe("ORIGIN")
        expect(gainNode?.recordedCostMinor).toBeNull()
        const extendedPreview = previewReviewedInventoryCostTrace({
          tenantId: actor.tenantId,
          bookId: book.id,
          currencyCode: "NGN",
          through: lateInput.through,
          pools: extendedAssembly.pools,
          nodes: extendedAssembly.nodes,
          evidence: [],
          now: new Date(),
        })
        expect(extendedPreview.missingOriginEventIds).toHaveLength(2)
        expect(extended.requiresClassificationProof).toBe(true)
        expect(extended.requiresConfirmationProof).toBe(true)
        await expect(
          db.$transaction(async (tx) => {
            await tx.financeInventoryValuationEvent.update({
              where: { id: gainEvent.id },
              data: { sourceCostMinor: 0n },
            })
            return readReviewedCostSourceAssemblyInTransaction(tx, lateInput)
          }, options),
        ).rejects.toThrow("Saved ordinary stock valuation differs")
        // Synthetic metadata probe: a saved label cannot grant unowned Product fulfillment.
        await expect(
          db.$transaction(async (tx) => {
            await tx.stockOperation.update({
              where: { id: ordinary.id },
              data: { type: "SALE_FULFILLMENT" },
            })
            const blocked = await readReviewedCostSourceAssemblyInTransaction(
              tx,
              lateInput,
            )
            expect(blocked.canAssemble).toBe(false)
            expect(blocked.assembly).toBeNull()
            expect(blocked.blockers).toContainEqual({
              code: "SOURCE_CONTRACT_PENDING",
              sourceId: ordinary.id,
            })
            throw new Error("ROLLBACK_UNSUPPORTED_OWNER_PROBE")
          }, options),
        ).rejects.toThrow("ROLLBACK_UNSUPPORTED_OWNER_PROBE")
        expect((await readLate()).sourceSnapshotHash).toBe(
          extended.sourceSnapshotHash,
        )
        stage("Ordinary source/rollback checks complete")
        const countBalance = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: source.id },
        })
        const countZeroBalance = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: transit.id },
        })
        const draftCount = await createStockCount(db, {
          ...actor,
          storeId: sourceStore.id,
          clientOperationId: `trace-count-${runId}`,
          schemaVersion: 1,
          reason: "QA complete count with a zero line",
          lines: [
            {
              balanceSourceId: source.id,
              expectedRevision: countBalance.revision,
              entries: [
                {
                  enteredInventoryUnitId: source.inventoryUnitId,
                  enteredQuantity: countBalance.onHandQuantity
                    .minus(1)
                    .toFixed(),
                },
              ],
            },
            {
              balanceSourceId: transit.id,
              expectedRevision: countZeroBalance.revision,
              entries: [
                {
                  enteredInventoryUnitId: transit.inventoryUnitId,
                  enteredQuantity: "0",
                },
              ],
            },
          ],
        })
        await finalizeStockCount(db, {
          ...actor,
          stockCountId: draftCount.id,
          clientOperationId: `trace-count-finalize-${runId}`,
          schemaVersion: 1,
          reason: "QA count-source trace",
        })
        const countedInput = { ...input, through: new Date() }
        const readCounted = () =>
          db.$transaction(
            (tx) =>
              readReviewedCostSourceAssemblyInTransaction(tx, countedInput),
            options,
          )
        stage("Stock Count composed read starts")
        const counted = await readCounted()
        expect(counted.canAssemble).toBe(true)
        expect(counted.assembly?.nodes).toHaveLength(12)
        expect(
          counted.assembly?.nodes.filter(
            (node) =>
              node.kind === "WITHDRAWAL" && node.purpose === "COUNT_SHORTAGE",
          ),
        ).toHaveLength(1)
        const zeroLine = await db.stockCountLine.findFirstOrThrow({
          where: { stockCountId: draftCount.id, balanceSourceId: transit.id },
        })
        await expect(
          db.$transaction(async (tx) => {
            await tx.stockCountLine.update({
              where: { id: zeroLine.id },
              data: { expectedQuantity: "0.25" },
            })
            return readReviewedCostSourceAssemblyInTransaction(tx, countedInput)
          }, options),
        ).rejects.toThrow(
          "Stock Count line quantity snapshots are inconsistent",
        )
        expect((await readCounted()).sourceSnapshotHash).toBe(
          counted.sourceSnapshotHash,
        )
        stage("Stock Count/zero-line rollback checks complete")
        expect(
          await db.financeJournalEntry.count({ where: { bookId: book.id } }),
        ).toBe(1)
        expect(
          await db.financeInventoryCostReview.count({
            where: { bookId: book.id },
          }),
        ).toBe(0)
        console.info(`source-assembly checks complete ${runId}`)
      } finally {
        const remaining = await cleanupConnectedCostAcceptance(
          db,
          {
            runId,
            tenantIds,
            userIds,
            bookIds,
          },
          { stockCounts: true },
        )
        expect(remaining).toHaveLength(34)
        expect(remaining.every((count) => count === 0)).toBe(true)
        console.info(
          `source-assembly cleanup complete ${runId}: 34 absence checks clear`,
        )
      }
    })
  },
)
