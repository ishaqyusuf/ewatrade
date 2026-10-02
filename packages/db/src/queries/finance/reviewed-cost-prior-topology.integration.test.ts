import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { postSingleBalanceStockOperation } from "../inventory-operations"
import { cleanupConnectedCostAcceptance } from "./reviewed-cost-connected.integration-cleanup"
import { createReservationTraceFixture } from "./reviewed-cost-reservation-acceptance-fixture"
import { readReviewedCostSourceAssemblyInTransaction } from "./reviewed-cost-source-assembly"

const options = { maxWait: 10_000, timeout: 30_000 }
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error(
      "Prior topology acceptance requires exact guarded development.",
    )
}

describeWithServiceCommerceDatabase("prior-review complete SQL closure", () => {
  test("pointer-only header expands an unrequested sibling pool and stays blocked without changing physical facts", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const began = Date.now()
    const scope = {
      runId,
      tenantIds: [] as string[],
      userIds: [] as string[],
      bookIds: [] as string[],
    }
    console.info(`prior-topology QA run ${runId}`)
    try {
      const f = await createReservationTraceFixture(db, scope)
      for (const [label, stock] of [
        ["packaged", f.packaged],
        ["shared", f.shared],
      ] as const) {
        await postSingleBalanceStockOperation(db, {
          ...f.actor,
          storeId: f.store.id,
          clientOperationId: `prior-${label}-${runId}`,
          balanceSourceId: stock.balance.id,
          enteredInventoryUnitId: stock.entered.id,
          enteredQuantity: "1",
          expectedBalanceRevision: 0,
          expectedConfigurationVersionId: stock.version.id,
          type: "receipt",
          direction: "increase",
          schemaVersion: 1,
          source: "inventory",
          reason: "QA UNKNOWN original receipt",
        })
      }
      const input = {
        ...f.actor,
        bookId: f.book.id,
        balanceSourceIds: [f.packaged.balance.id],
        through: new Date(),
      }
      const read = () =>
        db.$transaction(
          (tx) => readReviewedCostSourceAssemblyInTransaction(tx, input),
          options,
        )
      const original = await read()
      expect(original.canAssemble).toBe(true)
      expect("priorReviews" in original).toBe(false)
      const physicalBefore = await db.stockBalanceSource.findMany({
        where: { tenantId: f.actor.tenantId },
        orderBy: { id: "asc" },
      })
      const eventsBefore = await db.financeInventoryValuationEvent.findMany({
        where: { tenantId: f.actor.tenantId },
        orderBy: { id: "asc" },
      })
      let readMs = 0
      await expect(
        db.$transaction(async (tx) => {
          const review = await tx.financeInventoryCostReview.create({
            data: {
              tenantId: f.actor.tenantId,
              bookId: f.book.id,
              clientCommandId: `qa-prior-${runId}`,
              payloadHash: "a".repeat(64),
              costTraceHash: "b".repeat(64),
              reviewedSnapshotHash: "c".repeat(64),
              algorithmVersion: "qa-unproved-prior-topology",
              evidenceCutoff: new Date(),
              historyThrough: input.through,
              reviewedBookSequence: BigInt(0),
              reason: "QA pointer-only closure, not confirmed cost",
              sourceSnapshot: { qaOnly: true, runId },
              postingPlan: [],
              actorUserId: f.actor.actorUserId,
            },
          })
          const pools = await tx.financeInventoryPool.findMany({
            where: { tenantId: f.actor.tenantId },
            orderBy: { id: "asc" },
          })
          expect(pools).toHaveLength(2)
          const snapshots = pools.map((pool, index) => ({
            id: `${runId}-pool-${index}`,
            tenantId: pool.tenantId,
            bookId: pool.bookId,
            reviewId: review.id,
            poolId: pool.id,
            balanceSourceId: pool.balanceSourceId,
            quantity: pool.quantity,
            valueBeforeMinor: pool.valueMinor,
            valueAfterMinor: BigInt(0),
            expectedStockRevision: pool.lastStockRevision,
            expectedMovementCount: pool.lastMovementCount,
            expectedValuationSequence: pool.lastSequence,
          }))
          await tx.financeInventoryCostReviewPool.createMany({
            data: snapshots,
          })
          for (const snapshot of snapshots)
            await tx.financeInventoryPool.update({
              where: { id: snapshot.poolId },
              data: { lastCostReviewSnapshotId: snapshot.id },
            })
          const start = Date.now()
          const pending = await readReviewedCostSourceAssemblyInTransaction(
            tx,
            input,
          )
          readMs = Date.now() - start
          expect(pending.canAssemble).toBe(false)
          expect(pending.assembly).toBeNull()
          const prior = pending.priorReviews
          if (!prior)
            throw new Error("Missing retained prior-review source facts")
          expect(
            prior.snapshot.poolSnapshots.map((p) => p.balanceSourceId).sort(),
          ).toEqual([f.packaged.balance.id, f.shared.balance.id].sort())
          expect(prior.snapshot.allocations).toHaveLength(0)
          expect(prior.proof.incompleteReviewIds).toEqual([review.id])
          expect(prior.proof.topologyComplete).toBe(false)
          expect(prior.proof.requiresConfirmationProof).toBe(true)
          expect(prior.proof.requiresMonetaryProof).toBe(true)
          for (const snapshot of snapshots)
            expect(pending.blockers).toContainEqual({
              code: "PRIOR_REVIEW_PENDING",
              sourceId: snapshot.id,
            })
          expect(
            await tx.stockBalanceSource.findMany({
              where: { tenantId: f.actor.tenantId },
              orderBy: { id: "asc" },
            }),
          ).toEqual(physicalBefore)
          expect(
            await tx.financeInventoryValuationEvent.findMany({
              where: { tenantId: f.actor.tenantId },
              orderBy: { id: "asc" },
            }),
          ).toEqual(eventsBefore)
          console.info(
            JSON.stringify({
              runId,
              phase: "pointer-only-accepted",
              rootPoolsRequested: 1,
              poolsProved: prior.snapshot.poolSnapshots.length,
              readMs,
              monetaryBlocked: true,
            }),
          )
          throw new Error("ROLLBACK_PRIOR_TOPOLOGY_PROBE")
        }, options),
      ).rejects.toThrow("ROLLBACK_PRIOR_TOPOLOGY_PROBE")
      expect((await read()).sourceSnapshotHash).toBe(
        original.sourceSnapshotHash,
      )
      expect(
        await db.financeInventoryCostReview.count({
          where: { tenantId: f.actor.tenantId },
        }),
      ).toBe(0)
      expect(
        await db.financeInventoryCostReviewPool.count({
          where: { tenantId: f.actor.tenantId },
        }),
      ).toBe(0)
      console.info(
        JSON.stringify({
          runId,
          phase: "rollback-accepted",
          originalHashRestored: true,
          readMs,
        }),
      )
    } finally {
      const cleanup = await cleanupConnectedCostAcceptance(db, scope)
      for (const count of cleanup) expect(count).toBe(0)
      console.info(
        JSON.stringify({
          runId,
          phase: "cleanup",
          checks: cleanup.length,
          counts: cleanup,
          durationMs: Date.now() - began,
        }),
      )
    }
  }, 300_000)
})
