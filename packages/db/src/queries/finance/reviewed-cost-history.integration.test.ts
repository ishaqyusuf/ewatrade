import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createCatalogItem } from "../catalog"
import {
  postSingleBalanceStockOperation,
  postSingleBalanceStockOperationInTransaction,
} from "../inventory-operations"
import { lockFinanceBook } from "./access"
import { createFinanceBook } from "./accounts"
import { cleanupOpeningCostAcceptance } from "./opening-cost.integration-cleanup"
import { readReviewedCostPhysicalHistoryInTransaction } from "./reviewed-cost-history"
import { FinanceError } from "./rules"

setDefaultTimeout(600_000)

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error("Cost-history acceptance requires exact development.")
}

describeWithServiceCommerceDatabase(
  "reviewed cost physical-history reader",
  () => {
    test("reads complete owned history without guessing legacy/net-zero facts or mutating originals", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      console.info(`cost-history QA run ${runId}`)
      const tenantIds: string[] = []
      const userIds: string[] = []
      const bookIds: string[] = []
      try {
        const owner = await db.user.create({
          data: {
            name: "Cost-history QA owner",
            email: `opening-cost-${runId}@example.invalid`,
          },
        })
        userIds.push(owner.id)
        const manager = await db.user.create({
          data: {
            name: "Cost-history QA Inventory Manager",
            email: `opening-cost-manager-${runId}@example.invalid`,
          },
        })
        userIds.push(manager.id)
        async function scope(label: string) {
          const tenant = await db.tenant.create({
            data: {
              name: "Cost-history QA",
              slug: `opening-cost-history-${label}-${runId}`,
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              dataClassification: "QA",
              users: {
                create: [
                  { userId: owner.id, role: "OWNER", status: "ACTIVE" },
                  { userId: manager.id, role: "MANAGER", status: "ACTIVE" },
                ],
              },
            },
          })
          tenantIds.push(tenant.id)
          const store = await db.store.create({
            data: {
              tenantId: tenant.id,
              name: "Private history QA",
              slug: `history-${label}-${runId}`,
              countryCode: "NG",
              status: "ACTIVE",
            },
          })
          return { tenant, store }
        }
        const main = await scope("main")
        const foreign = await scope("foreign")
        const book = await createFinanceBook(db, {
          tenantId: main.tenant.id,
          actorUserId: owner.id,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        bookIds.push(book.id)
        async function original(target: typeof main, label: string) {
          const item = await createCatalogItem(db, {
            tenantId: target.tenant.id,
            storeId: target.store.id,
            actorUserId: owner.id,
            clientOperationId: `history-original-${label}-${runId}`,
            kind: "product",
            name: "History QA original",
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
                openingStockQuantity: "4",
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
          const balance = item.product?.stockBalances[0]
          if (!balance) throw new Error("History original balance missing")
          return db.stockBalanceSource.findUniqueOrThrow({
            where: { id: balance.id },
            include: { inventoryUnit: true },
          })
        }
        const first = await original(main, "first")
        const second = await original(main, "second")
        const outside = await original(foreign, "foreign")
        const actor = { tenantId: main.tenant.id, actorUserId: owner.id }
        const through = new Date()
        const input = {
          ...actor,
          bookId: book.id,
          balanceSourceIds: [first.id, second.id],
          through,
        }
        const options = { maxWait: 10_000, timeout: 30_000 }
        async function read(
          changes: Partial<typeof input> = {},
          prepare?: (tx: Prisma.TransactionClient) => Promise<unknown>,
        ) {
          return db.$transaction(async (tx) => {
            if (prepare) await prepare(tx)
            return readReviewedCostPhysicalHistoryInTransaction(tx, {
              ...input,
              ...changes,
            })
          }, options)
        }
        async function rejected(
          promise: Promise<unknown>,
          code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND",
        ) {
          try {
            await promise
            throw new Error("Expected rejected real history")
          } catch (error) {
            expect(error).toBeInstanceOf(FinanceError)
            if (!(error instanceof FinanceError)) throw error
            expect(error.code).toBe(code)
          }
        }
        const initial = await read()
        expect(initial.scope).toBe("REQUESTED_PHYSICAL_BALANCES")
        expect(initial.requiresCostGraphClosure).toBe(true)
        expect(initial.balances).toHaveLength(2)
        for (const row of initial.balances) {
          expect(row.physicalQuantityReconciled).toBe(true)
          expect(row.issues).toEqual([])
          expect(row.canonicalOnHandQuantity).toBe("4")
          expect(row.impliedBaselineQuantity).toBe("0")
          expect(row.snapshot.pool?.valueMinor).toBeNull()
          expect(row.movements).toHaveLength(1)
          expect(row.movements[0]?.valuation?.sourceCostMinor).toBeNull()
        }
        expect(
          (await read({ balanceSourceIds: [second.id, first.id] }))
            .physicalSnapshotHash,
        ).toBe(initial.physicalSnapshotHash)
        await rejected(read({ actorUserId: manager.id }), "FORBIDDEN")
        await rejected(read({ balanceSourceIds: [outside.id] }), "CONFLICT")
        await rejected(
          read({ balanceSourceIds: [first.id, outside.id] }),
          "CONFLICT",
        )
        await rejected(read({ bookId: randomUUID() }), "NOT_FOUND")
        await rejected(
          read({ balanceSourceIds: [first.id, first.id] }),
          "CONFLICT",
        )
        await rejected(read({ balanceSourceIds: [] }), "CONFLICT")
        await rejected(
          read({ through: new Date("2030-01-01T00:00:00Z") }),
          "CONFLICT",
        )
        // A current physical snapshot cannot silently trim later movements to fit
        // an older requested cutoff.
        await rejected(
          read({ through: new Date("2026-01-01T00:00:00Z") }),
          "CONFLICT",
        )
        await postSingleBalanceStockOperation(db, {
          ...actor,
          storeId: main.store.id,
          clientOperationId: `history-withdrawal-${runId}`,
          balanceSourceId: first.id,
          enteredInventoryUnitId: first.inventoryUnitId,
          enteredQuantity: "1",
          expectedBalanceRevision: first.revision,
          expectedConfigurationVersionId:
            first.inventoryUnit.configurationVersionId,
          direction: "decrease",
          type: "adjustment",
          source: "QA_HISTORY_WITHDRAWAL",
          schemaVersion: 1,
          reason: "QA physical withdrawal; no COGS authority",
        })
        const current = await read({ through: new Date() })
        const firstHistory = current.balances.find(
          (row) => row.balanceSourceId === first.id,
        )
        if (!firstHistory) throw new Error("Withdrawn history missing")
        expect(firstHistory.movements).toHaveLength(2)
        expect(firstHistory.issues).toEqual([])
        expect(firstHistory.canonicalOnHandQuantity).toBe("3")
        expect(firstHistory.physicalQuantityReconciled).toBe(true)
        expect(firstHistory.snapshot.pool?.valueMinor).toBeNull()
        expect(current.physicalSnapshotHash).not.toBe(
          initial.physicalSnapshotHash,
        )
        // Real physical-only domain composition creates an unregistered net-zero
        // pair. The owning caller holds the Book before the stock operations.
        await db.$transaction(async (tx) => {
          await lockFinanceBook(tx, { ...actor, bookId: book.id })
          const directions: Array<"decrease" | "increase"> = [
            "decrease",
            "increase",
          ]
          for (const [index, direction] of directions.entries()) {
            await postSingleBalanceStockOperationInTransaction(tx, {
              ...actor,
              storeId: main.store.id,
              clientOperationId: `history-legacy-${index}-${runId}`,
              balanceSourceId: first.id,
              enteredInventoryUnitId: first.inventoryUnitId,
              enteredQuantity: "1",
              expectedBalanceRevision: first.revision + index + 1,
              expectedConfigurationVersionId:
                first.inventoryUnit.configurationVersionId,
              direction,
              type: "adjustment",
              source: "QA_HISTORY_LEGACY_PAIR",
              schemaVersion: 1,
              reason: "QA legacy physical-only pair",
            })
          }
        }, options)
        const legacyInput = {
          through: new Date(),
          balanceSourceIds: [first.id],
        }
        const legacy = await read(legacyInput)
        const legacyHistory = legacy.balances[0]
        if (!legacyHistory) throw new Error("Legacy history missing")
        expect(legacyHistory.movements).toHaveLength(4)
        expect(legacyHistory.canonicalOnHandQuantity).toBe("3")
        expect(legacyHistory.physicalQuantityReconciled).toBe(true)
        expect(legacyHistory.issues).toEqual([
          "UNREGISTERED_MOVEMENTS",
          "STALE_VALUATION_PROJECTION",
        ])
        expect(legacyHistory.orderedMovementIds).toHaveLength(4)
        expect(legacy.physicalSnapshotHash).not.toBe(
          current.physicalSnapshotHash,
        )
        // Crossed operation ownership and unit corruption are not hidden by query
        // filters. Deliberate QA mutations and rejected reads roll back together.
        // A registered operation is already protected by the valuation event's
        // scoped FK; use an unregistered legacy operation to reach this audit.
        const legacyMovement = legacyHistory.movements.find(
          (row) => row.valuation === null,
        )
        if (!legacyMovement)
          throw new Error("Unregistered legacy movement missing")
        await rejected(
          read(legacyInput, (tx) =>
            tx.stockOperation.update({
              where: { id: legacyMovement.operation.id },
              data: { tenantId: foreign.tenant.id },
            }),
          ),
          "CONFLICT",
        )
        const firstMovement = legacyHistory.movements[0]
        if (!firstMovement)
          throw new Error("Original physical movement missing")
        await rejected(
          read(legacyInput, (tx) =>
            tx.stockMovement.update({
              where: { id: firstMovement.id },
              data: { unitFactorSnapshot: "12" },
            }),
          ),
          "CONFLICT",
        )
        await rejected(
          read(legacyInput, (tx) =>
            tx.store.update({
              where: { id: main.store.id },
              data: { currencyCode: "USD" },
            }),
          ),
          "CONFLICT",
        )
        expect((await read(legacyInput)).physicalSnapshotHash).toBe(
          legacy.physicalSnapshotHash,
        )
        expect(
          await db.financeInventoryCostReview.count({
            where: { bookId: book.id },
          }),
        ).toBe(0)
        expect(
          await db.financeJournalEntry.count({ where: { bookId: book.id } }),
        ).toBe(0)
        console.info(`cost-history operating checks complete ${runId}`)
      } finally {
        const remaining = await cleanupOpeningCostAcceptance(db, {
          runId,
          tenantIds,
          userIds,
          bookIds,
        })
        expect(remaining).toHaveLength(23)
        expect(remaining.every((count) => count === 0)).toBe(true)
        console.info(
          `cost-history cleanup complete ${runId}: 23 absence checks clear`,
        )
      }
    })
  },
)
