import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  correctStockOperation,
  postSingleBalanceStockOperation,
} from "../inventory-operations"
import { recordFinancePurchase } from "./purchases"
import {
  cleanupReservationTraceFixture,
  createReservationTraceFixture,
} from "./reviewed-cost-reservation-acceptance-fixture"
import { readReviewedCostSourceAssemblyInTransaction as readAssembly } from "./reviewed-cost-source-assembly"
import { previewReviewedInventoryCostTrace } from "./reviewed-cost-trace"
import { financePayloadHash } from "./rules"
import { createFinanceSupplier } from "./supplier-writes"

const options = { maxWait: 10_000, timeout: 30_000 }
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error(
      "Ordinary correction acceptance requires exact guarded development.",
    )
}

describeWithServiceCommerceDatabase(
  "original ordinary correction trace",
  () => {
    test("reconciles known restoration and UNKNOWN groups, rejects crossed originals and preserves replay", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const began = Date.now()
      const scope = {
        runId,
        tenantIds: [] as string[],
        userIds: [] as string[],
        bookIds: [] as string[],
      }
      const evidence: Record<string, unknown> = {
        runId,
        transactionOptions: options,
      }
      const stage = (label: string) =>
        console.info(
          `ordinary-correction-trace ${runId}: ${label}, ${Date.now() - began}ms`,
        )
      stage("QA run starts")
      try {
        const f = await createReservationTraceFixture(db, scope)
        const supplier = await createFinanceSupplier(db, {
          ...f.actor,
          bookId: f.book.id,
          clientCommandId: `supplier-${runId}`,
          code: `OC-${runId.slice(0, 8)}`,
          name: "Private correction QA",
        })
        await recordFinancePurchase(db, {
          ...f.actor,
          bookId: f.book.id,
          clientCommandId: `purchase-${runId}`,
          supplierId: supplier.id,
          storeId: f.store.id,
          incurredAt: new Date("2026-09-15T12:00:00Z"),
          description: "QA known original cost",
          lines: [
            {
              balanceSourceId: f.packaged.balance.id,
              enteredInventoryUnitId: f.packaged.entered.id,
              expectedConfigurationVersionId: f.packaged.version.id,
              expectedBalanceRevision: 0,
              enteredQuantity: "2",
              amountMinor: "1001",
              description: "QA exact correction source",
              categories: [{ name: `Correction QA ${runId.slice(0, 8)}` }],
            },
          ],
        })
        await postSingleBalanceStockOperation(db, {
          ...f.actor,
          storeId: f.store.id,
          clientOperationId: `unknown-receipt-${runId}`,
          balanceSourceId: f.shared.balance.id,
          enteredInventoryUnitId: f.shared.entered.id,
          enteredQuantity: "2",
          expectedBalanceRevision: 0,
          expectedConfigurationVersionId: f.shared.version.id,
          type: "receipt",
          direction: "increase",
          schemaVersion: 1,
          source: "inventory",
          reason: "QA UNKNOWN original cost",
        })
        async function corrected(stock: typeof f.packaged, label: string) {
          const current = await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: stock.balance.id },
          })
          const original = await postSingleBalanceStockOperation(db, {
            ...f.actor,
            storeId: f.store.id,
            clientOperationId: `ordinary-${label}-${runId}`,
            balanceSourceId: stock.balance.id,
            enteredInventoryUnitId: stock.entered.id,
            enteredQuantity: "0.5",
            expectedBalanceRevision: current.revision,
            expectedConfigurationVersionId: stock.version.id,
            type: "adjustment",
            direction: "decrease",
            schemaVersion: 1,
            source: "inventory",
            reason: "QA original ordinary withdrawal",
          })
          const movement = await db.stockMovement.findFirstOrThrow({
            where: { operationId: original.id },
          })
          const before = await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: stock.balance.id },
          })
          const command = {
            ...f.actor,
            clientOperationId: `correction-${label}-${runId}`,
            targetOperationId: original.id,
            corrections: [
              {
                movementId: movement.id,
                correctedEnteredQuantity: "0.25",
                expectedBalanceRevision: before.revision,
              },
            ],
            reason: "QA corrected ordinary withdrawal",
            schemaVersion: 1,
            source: "inventory",
          }
          const correction = await correctStockOperation(db, command)
          const inverse = await db.stockMovement.findFirstOrThrow({
            where: {
              operationId: correction.id,
              reversalOfMovementId: movement.id,
            },
          })
          const events = await db.financeInventoryValuationEvent.findMany({
            where: { stockOperationId: correction.id },
          })
          const inverseEvent = events.find(
            (e) => e.stockMovementId === inverse.id,
          )
          const replacementEvent = events.find(
            (e) => e.stockMovementId !== inverse.id,
          )
          if (!inverseEvent || !replacementEvent)
            throw new Error("Missing original correction pair")
          expect(events).toHaveLength(2)
          return {
            original,
            movement,
            correction,
            inverse,
            inverseEvent,
            replacementEvent,
            command,
          }
        }
        const known = await corrected(f.packaged, "known")
        const unknown = await corrected(f.shared, "unknown")
        expect(known.inverseEvent.sourceCostMinor).toBe(250n)
        expect(known.replacementEvent.sourceCostMinor).toBe(125n)
        expect(known.replacementEvent.valueAfterMinor).toBe(876n)
        expect(unknown.inverseEvent.sourceCostMinor).toBeNull()
        expect(unknown.replacementEvent.valueAfterMinor).toBeNull()
        const originalEvents = await db.financeInventoryValuationEvent.findMany(
          { where: { bookId: f.book.id }, orderBy: { id: "asc" } },
        )
        const through = new Date()
        const context = { ...f.actor, bookId: f.book.id, through }
        const input = { ...context, balanceSourceIds: [f.packaged.balance.id] }
        stage("known composed read starts")
        const graph = await db.$transaction(
          (tx) => readAssembly(tx, input),
          options,
        )
        expect(graph.canAssemble).toBe(true)
        expect(graph.blockers).toEqual([])
        const assembly = graph.assembly
        if (!assembly) throw new Error("Missing known correction assembly")
        expect(assembly.pools).toHaveLength(1)
        expect(assembly.nodes).toHaveLength(4)
        expect(
          assembly.nodes.find((n) => n.id === `movement:${known.inverse.id}`),
        ).toMatchObject({
          kind: "RESTORATION",
          originalIssueId: `movement:${known.movement.id}`,
          recordedCostMinor: 250n,
        })
        const preview = previewReviewedInventoryCostTrace({
          ...context,
          currencyCode: "NGN",
          now: through,
          pools: assembly.pools,
          nodes: assembly.nodes,
          evidence: [],
        })
        expect(preview.completeCostTrace).toBe(true)
        expect(preview.pools[0]?.valueMinor).toBe(876n)
        evidence.known = {
          pools: assembly.pools.length,
          nodes: assembly.nodes.length,
          sourceSnapshotHash: graph.sourceSnapshotHash,
          assemblySnapshotHash: assembly.assemblySnapshotHash,
        }
        stage("known original restoration accepted")
        const unknownGraph = await db.$transaction(
          (tx) =>
            readAssembly(tx, {
              ...context,
              balanceSourceIds: [f.shared.balance.id],
            }),
          options,
        )
        expect(unknownGraph.canAssemble).toBe(true)
        const unknownAssembly = unknownGraph.assembly
        if (!unknownAssembly)
          throw new Error("Missing UNKNOWN correction assembly")
        const unknownPreview = previewReviewedInventoryCostTrace({
          ...context,
          currencyCode: "NGN",
          now: through,
          pools: unknownAssembly.pools,
          nodes: unknownAssembly.nodes,
          evidence: [],
        })
        expect(unknownPreview.completeCostTrace).toBe(false)
        expect(unknownPreview.pools[0]?.valueMinor).toBeNull()
        evidence.unknown = {
          pools: unknownAssembly.pools.length,
          nodes: unknownAssembly.nodes.length,
          sourceSnapshotHash: unknownGraph.sourceSnapshotHash,
        }
        stage("UNKNOWN original correction accepted")
        const probes: Array<{
          label: string
          mutate: (tx: Prisma.TransactionClient) => Promise<unknown>
        }> = [
          {
            label: "restored original allocation",
            mutate: (tx) =>
              tx.financeInventoryValuationEvent.update({
                where: { id: known.inverseEvent.id },
                data: { sourceCostMinor: 249n },
              }),
          },
          {
            label: "inverse original movement link",
            mutate: (tx) =>
              tx.stockMovement.update({
                where: { id: known.inverse.id },
                data: { reversalOfMovementId: unknown.movement.id },
              }),
          },
          {
            label: "partial saved registration",
            mutate: (tx) =>
              tx.financeInventoryValuationEvent.delete({
                where: { id: known.replacementEvent.id },
              }),
          },
        ]
        for (const probe of probes) {
          await expect(
            db.$transaction(async (tx) => {
              await probe.mutate(tx)
              await readAssembly(tx, input)
              throw new Error("UNEXPECTED_CORRECTION_ACCEPTANCE")
            }, options),
          ).rejects.toMatchObject({ code: "CONFLICT" })
          stage(`${probe.label} refused and rolled back`)
        }
        expect(await correctStockOperation(db, known.command)).toEqual(
          known.correction,
        )
        const replay = await db.$transaction(
          (tx) => readAssembly(tx, input),
          options,
        )
        expect(replay.sourceSnapshotHash).toBe(graph.sourceSnapshotHash)
        expect(replay.assembly?.assemblySnapshotHash).toBe(
          assembly.assemblySnapshotHash,
        )
        expect(
          financePayloadHash(
            await db.financeInventoryValuationEvent.findMany({
              where: { bookId: f.book.id },
              orderBy: { id: "asc" },
            }),
          ),
        ).toBe(financePayloadHash(originalEvents))
        expect(
          await db.financeJournalEntry.count({ where: { bookId: f.book.id } }),
        ).toBe(1)
        expect(graph.requiresMonetaryProof).toBe(true)
        expect(graph.requiresConfirmationProof).toBe(true)
        evidence.mutationRollbackProbes = probes.map((p) => p.label)
        evidence.stableReplayAccepted = true
        stage("stable original commands and saved events accepted")
      } finally {
        const remaining = await cleanupReservationTraceFixture(db, scope)
        expect(remaining).toHaveLength(31)
        expect(remaining.every((n) => n === 0)).toBe(true)
        evidence.cleanup = { checks: remaining.length, remaining }
        evidence.durationMs = Date.now() - began
        writeFileSync(
          new URL(
            "../../../../../.brain/artifacts/2026-10-02-ordinary-correction-cost-trace/live-result.json",
            import.meta.url,
          ),
          JSON.stringify(evidence, null, 2),
        )
        stage(`all ${remaining.length} cleanup checks clear`)
      }
    }, 900_000)
  },
)
