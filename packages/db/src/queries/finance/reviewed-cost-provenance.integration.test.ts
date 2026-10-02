import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createCatalogItem } from "../catalog"
import { FINANCE_DEFAULT_ACCOUNTS, createFinanceBook } from "./accounts"
import { cleanupOpeningCostAcceptance } from "./opening-cost.integration-cleanup"

setDefaultTimeout(600_000)

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error(
      "Cost review provenance acceptance requires the exact development database.",
    )
}

describeWithServiceCommerceDatabase(
  "reviewed inventory cost provenance schema",
  () => {
    test("retains scoped originals, rejects crossed/forked references and rolls back a late journal-link failure", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      console.info(`cost-review provenance QA run ${runId}`)
      const tenantIds: string[] = []
      const userIds: string[] = []
      const bookIds: string[] = []
      try {
        const owner = await db.user.create({
          data: {
            name: "Cost review schema QA",
            email: `opening-cost-${runId}@example.invalid`,
          },
        })
        userIds.push(owner.id)
        async function scope(label: string) {
          const tenant = await db.tenant.create({
            data: {
              name: "Cost review schema QA",
              slug: `opening-cost-review-${label}-${runId}`,
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              dataClassification: "QA",
              users: {
                create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
              },
            },
          })
          tenantIds.push(tenant.id)
          const store = await db.store.create({
            data: {
              tenantId: tenant.id,
              name: "Private schema QA",
              slug: `review-${label}-${runId}`,
              countryCode: "NG",
              status: "ACTIVE",
            },
          })
          const book = await createFinanceBook(db, {
            tenantId: tenant.id,
            actorUserId: owner.id,
            startsAt: new Date("2026-01-01T00:00:00Z"),
          })
          bookIds.push(book.id)
          return { tenant, store, book }
        }
        const main = await scope("main")
        const foreign = await scope("foreign")
        const otherBook = await db.financeBook.create({
          data: {
            tenantId: main.tenant.id,
            currencyCode: "USD",
            timezone: "Africa/Lagos",
            startsAt: new Date("2026-01-01T00:00:00Z"),
            createdById: owner.id,
            accounts: { create: FINANCE_DEFAULT_ACCOUNTS },
          },
        })
        bookIds.push(otherBook.id)
        async function original(target: typeof main, label: string) {
          const item = await createCatalogItem(db, {
            tenantId: target.tenant.id,
            storeId: target.store.id,
            actorUserId: owner.id,
            clientOperationId: `schema-original-${label}-${runId}`,
            kind: "product",
            name: "Cost review schema original",
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
          if (!balance)
            throw new Error("Schema fixture original balance missing")
          return db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { bookId: target.book.id, balanceSourceId: balance.id },
            include: { pool: true },
          })
        }
        const first = await original(main, "first")
        const second = await original(main, "second")
        const outside = await original(foreign, "foreign")
        const rows = await db.$queryRaw<
          Array<{ tableName: string; definition: string }>
        >`
        SELECT rel.relname AS "tableName", pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c JOIN pg_class rel ON rel.oid = c.conrelid
        WHERE c.contype = 'f' AND
          (rel.relname IN ('FinanceInventoryCostReview', 'FinanceInventoryCostReviewAllocation',
            'FinanceInventoryCostReviewEvidence', 'FinanceInventoryCostReviewPool', 'FinanceInventoryCostReviewJournal')
            OR (rel.relname = 'FinanceInventoryPool' AND c.conname = 'FinanceInventoryPool_bookId_id_balanceSourceId_lastCostRev_fkey'))
      `
        expect(rows).toHaveLength(18)
        for (const row of rows)
          expect(row.definition).toContain("ON DELETE RESTRICT")
        const returnFk = rows.find(
          (row) =>
            row.tableName === "FinanceInventoryCostReviewAllocation" &&
            row.definition.includes(
              'REFERENCES "FinanceProductReturnCostAllocation"',
            ),
        )
        expect(returnFk?.definition).toContain(
          'FOREIGN KEY ("tenantId", "bookId", "productReturnAllocationId")',
        )
        const priorFk = rows.find(
          (row) =>
            row.tableName === "FinanceInventoryCostReviewAllocation" &&
            row.definition.includes('"previousResolutionId"'),
        )
        expect(priorFk?.definition).toContain(
          'FOREIGN KEY ("bookId", "sourceKey", "previousResolutionId")',
        )

        // Deliberately synthetic, QA-only monetary facts test persistence constraints,
        // not review authority, posting policy or an implemented confirmation command.
        function reviewData(
          label: string,
          target = main,
        ): Prisma.FinanceInventoryCostReviewUncheckedCreateInput {
          return {
            tenantId: target.tenant.id,
            bookId: target.book.id,
            clientCommandId: `schema-review-${label}-${runId}`,
            payloadHash: "a".repeat(64),
            costTraceHash: "b".repeat(64),
            reviewedSnapshotHash: "c".repeat(64),
            algorithmVersion: "weighted-average-original-return-v1",
            evidenceCutoff: first.effectiveAt,
            historyThrough: first.effectiveAt,
            reviewedBookSequence: 0n,
            reason: "QA-only provenance constraint probe",
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
        const thirdReview = await db.financeInventoryCostReview.create({
          data: reviewData("third"),
        })
        const foreignReview = await db.financeInventoryCostReview.create({
          data: reviewData("foreign", foreign),
        })
        const fk = async (work: PromiseLike<unknown>) => {
          await expect(Promise.resolve(work)).rejects.toMatchObject({
            code: "P2003",
          })
        }
        const unique = async (work: PromiseLike<unknown>) => {
          await expect(Promise.resolve(work)).rejects.toMatchObject({
            code: "P2002",
          })
        }
        await unique(
          db.financeInventoryCostReview.create({ data: reviewData("first") }),
        )
        await fk(
          db.financeInventoryCostReview.create({
            data: { ...reviewData("crossed"), tenantId: foreign.tenant.id },
          }),
        )
        function allocationData(
          event: typeof first,
          reviewId = review.id,
        ): Prisma.FinanceInventoryCostReviewAllocationUncheckedCreateInput {
          return {
            tenantId: main.tenant.id,
            bookId: main.book.id,
            reviewId,
            poolId: event.poolId,
            balanceSourceId: event.balanceSourceId,
            sourceKey: `movement:${event.stockMovementId}`,
            kind: "ORIGIN",
            ordinal: 1n,
            effectiveAt: event.effectiveAt,
            quantity: "4",
            quantityBefore: "0",
            quantityAfter: "4",
            recordedCostMinor: null,
            resolvedCostMinor: 1001n,
            valuationEventId: event.id,
            stockOperationId: event.stockOperationId,
            stockMovementId: event.stockMovementId,
          }
        }
        const allocation = await db.financeInventoryCostReviewAllocation.create(
          { data: allocationData(first) },
        )
        const otherAllocation =
          await db.financeInventoryCostReviewAllocation.create({
            data: allocationData(second),
          })
        await unique(
          db.financeInventoryCostReviewAllocation.create({
            data: allocationData(first),
          }),
        )
        await unique(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first),
              sourceKey: "qa-duplicate-ordinal",
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first, thirdReview.id),
              poolId: second.poolId,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first, thirdReview.id),
              valuationEventId: outside.id,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first, thirdReview.id),
              stockOperationId: second.stockOperationId,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first, thirdReview.id),
              stockMovementId: outside.stockMovementId,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first, thirdReview.id),
              productReturnAllocationId: `missing-${runId}`,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first, thirdReview.id),
              reviewId: foreignReview.id,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first, thirdReview.id),
              bookId: otherBook.id,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first, thirdReview.id),
              originalSourceKey: "missing-original",
            },
          }),
        )
        const next = await db.financeInventoryCostReviewAllocation.create({
          data: {
            ...allocationData(first, nextReview.id),
            previousResolutionId: allocation.id,
            resolvedCostMinor: 1050n,
          },
        })
        expect(next.previousResolutionId).toBe(allocation.id)
        await unique(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(first, thirdReview.id),
              previousResolutionId: allocation.id,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(second, thirdReview.id),
              previousResolutionId: allocation.id,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.create({
            data: {
              ...allocationData(second, thirdReview.id),
              originalSourceKey: next.sourceKey,
            },
          }),
        )

        const mainAccount = await db.financeAccount.findUniqueOrThrow({
          where: { bookId_code: { bookId: main.book.id, code: "3900" } },
        })
        const wrongAccount = await db.financeAccount.findUniqueOrThrow({
          where: { bookId_code: { bookId: otherBook.id, code: "3900" } },
        })
        const bill = await db.financeBill.create({
          data: {
            bookId: main.book.id,
            kind: "PURCHASE",
            payeeName: "QA only",
            description: "Schema probe",
            incurredAt: first.effectiveAt,
            totalMinor: 1001n,
            actorUserId: owner.id,
            lines: {
              create: {
                accountId: mainAccount.id,
                position: 1,
                description: "QA only",
                amountMinor: 1001n,
              },
            },
          },
          include: { lines: true },
        })
        const foreignBill = await db.financeBill.create({
          data: {
            bookId: otherBook.id,
            kind: "PURCHASE",
            payeeName: "QA only",
            description: "Schema probe",
            incurredAt: first.effectiveAt,
            totalMinor: 1001n,
            actorUserId: owner.id,
            lines: {
              create: {
                accountId: wrongAccount.id,
                position: 1,
                description: "QA only",
                amountMinor: 1001n,
              },
            },
          },
          include: { lines: true },
        })
        const billLine = bill.lines[0]
        const foreignBillLine = foreignBill.lines[0]
        if (!billLine || !foreignBillLine)
          throw new Error("Schema fixture bill line missing")
        const journal = await db.financeJournalEntry.create({
          data: {
            bookId: main.book.id,
            sequence: 1n,
            sourceKind: "QA_COST_REVIEW_SCHEMA",
            sourceId: runId,
            payloadHash: "d".repeat(64),
            description: "QA-only original journal link",
            actorUserId: owner.id,
            effectiveAt: first.effectiveAt,
          },
        })
        const foreignJournal = await db.financeJournalEntry.create({
          data: {
            bookId: otherBook.id,
            sequence: 1n,
            sourceKind: "QA_COST_REVIEW_SCHEMA",
            sourceId: runId,
            payloadHash: "d".repeat(64),
            description: "QA-only original journal link",
            actorUserId: owner.id,
            effectiveAt: first.effectiveAt,
          },
        })
        const evidenceData: Prisma.FinanceInventoryCostReviewEvidenceUncheckedCreateInput =
          {
            tenantId: main.tenant.id,
            bookId: main.book.id,
            reviewId: review.id,
            allocationId: allocation.id,
            mode: "RESOLVE_UNKNOWN",
            classification: "SOURCE_CORRECTION",
            originalCostMinor: 1001n,
            evidenceReference: `QA-only-${runId}`,
            sourceDocumentKind: "QA_SCHEMA_PROBE",
            sourceEffectiveAt: first.effectiveAt,
            postingEffectiveAt: first.effectiveAt,
            counterAccountId: mainAccount.id,
            billLineId: billLine.id,
            sourceJournalEntryId: journal.id,
            basis: { qaOnly: true },
          }
        await db.financeInventoryCostReviewEvidence.create({
          data: evidenceData,
        })
        await unique(
          db.financeInventoryCostReviewEvidence.create({ data: evidenceData }),
        )
        await fk(
          db.financeInventoryCostReviewEvidence.create({
            data: {
              ...evidenceData,
              allocationId: otherAllocation.id,
              counterAccountId: wrongAccount.id,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewEvidence.create({
            data: {
              ...evidenceData,
              allocationId: otherAllocation.id,
              billLineId: foreignBillLine.id,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewEvidence.create({
            data: {
              ...evidenceData,
              allocationId: otherAllocation.id,
              sourceJournalEntryId: foreignJournal.id,
            },
          }),
        )
        await fk(
          db.financeInventoryCostReviewEvidence.create({
            data: { ...evidenceData, reviewId: nextReview.id },
          }),
        )
        function snapshotData(
          event = first,
          reviewId = review.id,
        ): Prisma.FinanceInventoryCostReviewPoolUncheckedCreateInput {
          return {
            tenantId: main.tenant.id,
            bookId: main.book.id,
            reviewId,
            poolId: event.poolId,
            balanceSourceId: event.balanceSourceId,
            quantity: "4",
            valueBeforeMinor: null,
            valueAfterMinor: 1001n,
            expectedStockRevision: event.pool.lastStockRevision,
            expectedMovementCount: event.pool.lastMovementCount,
            expectedValuationSequence: event.pool.lastSequence,
          }
        }
        const snapshot = await db.financeInventoryCostReviewPool.create({
          data: snapshotData(),
        })
        const otherSnapshot = await db.financeInventoryCostReviewPool.create({
          data: snapshotData(second),
        })
        await unique(
          db.financeInventoryCostReviewPool.create({ data: snapshotData() }),
        )
        await fk(
          db.financeInventoryPool.update({
            where: { id: first.poolId },
            data: { lastCostReviewSnapshotId: otherSnapshot.id },
          }),
        )
        await db.financeInventoryPool.update({
          where: { id: first.poolId },
          data: { lastCostReviewSnapshotId: snapshot.id },
        })
        const retained = await db.financeInventoryPool.findUniqueOrThrow({
          where: { id: first.poolId },
        })
        expect(retained.lastCostReviewSnapshotId).toBe(snapshot.id)
        const journalData = {
          tenantId: main.tenant.id,
          bookId: main.book.id,
          reviewId: review.id,
          journalEntryId: journal.id,
          groupKey: "QA_ONLY",
          basis: { qaOnly: true },
        }
        await db.financeInventoryCostReviewJournal.create({ data: journalData })
        await unique(
          db.financeInventoryCostReviewJournal.create({
            data: { ...journalData, reviewId: nextReview.id },
          }),
        )
        await fk(
          db.financeInventoryCostReviewJournal.create({
            data: {
              ...journalData,
              journalEntryId: foreignJournal.id,
              groupKey: "FOREIGN",
            },
          }),
        )
        await fk(
          db.financeInventoryCostReview.delete({ where: { id: review.id } }),
        )
        await fk(
          db.financeInventoryValuationEvent.delete({ where: { id: first.id } }),
        )
        await fk(
          db.financeInventoryCostReviewAllocation.delete({
            where: { id: allocation.id },
          }),
        )
        await fk(
          db.financeInventoryCostReviewPool.delete({
            where: { id: snapshot.id },
          }),
        )

        const beforeBook = await db.financeBook.findUniqueOrThrow({
          where: { id: main.book.id },
        })
        const rollbackCommand = `schema-review-rollback-${runId}`
        await fk(
          db.$transaction(
            async (tx) => {
              const rolledReview = await tx.financeInventoryCostReview.create({
                data: {
                  ...reviewData("rollback"),
                  clientCommandId: rollbackCommand,
                },
              })
              await tx.financeInventoryCostReviewAllocation.create({
                data: {
                  ...allocationData(first, rolledReview.id),
                  previousResolutionId: next.id,
                },
              })
              const rolledSnapshot =
                await tx.financeInventoryCostReviewPool.create({
                  data: snapshotData(first, rolledReview.id),
                })
              await tx.financeInventoryPool.update({
                where: { id: first.poolId },
                data: {
                  valueMinor: 1999n,
                  lastCostReviewSnapshotId: rolledSnapshot.id,
                },
              })
              await tx.financeBook.update({
                where: { id: main.book.id },
                data: { lastSequence: { increment: 1n } },
              })
              await tx.financeInventoryCostReviewJournal.create({
                data: {
                  ...journalData,
                  reviewId: rolledReview.id,
                  journalEntryId: `missing-journal-${runId}`,
                },
              })
            },
            { maxWait: 10_000, timeout: 30_000 },
          ),
        )
        expect(
          await db.financeInventoryCostReview.count({
            where: { bookId: main.book.id, clientCommandId: rollbackCommand },
          }),
        ).toBe(0)
        expect(
          await db.financeInventoryPool.findUniqueOrThrow({
            where: { id: first.poolId },
          }),
        ).toEqual(retained)
        expect(
          (
            await db.financeBook.findUniqueOrThrow({
              where: { id: main.book.id },
            })
          ).lastSequence,
        ).toBe(beforeBook.lastSequence)
        const originals = await db.financeInventoryValuationEvent.findMany({
          where: { id: { in: [first.id, second.id, outside.id] } },
        })
        expect(originals).toHaveLength(3)
        for (const event of originals) {
          expect(event.sourceCostMinor).toBeNull()
          expect(event.valueAfterMinor).toBeNull()
        }
        expect(
          await db.stockMovement.count({
            where: { operation: { tenantId: { in: tenantIds } } },
          }),
        ).toBe(3)
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
          `cost-review provenance QA cleanup ${runId}: ${remaining.length} absence checks clear`,
        )
      }
    })
  },
)
