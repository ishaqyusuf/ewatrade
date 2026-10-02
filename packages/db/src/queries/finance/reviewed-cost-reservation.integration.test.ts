import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  commitCatalogStockReservation,
  reserveCatalogOfferingStock,
} from "../catalog-inventory"
import { postSingleBalanceStockOperation } from "../inventory-operations"
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
      "Reservation trace acceptance requires exact guarded development.",
    )
}

describeWithServiceCommerceDatabase(
  "standalone reservation source composition",
  () => {
    test("retains original weighted and UNKNOWN costs, refuses changed proof and replays stable source", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      const scope = {
        runId,
        tenantIds: [] as string[],
        userIds: [] as string[],
        bookIds: [] as string[],
      }
      const began = Date.now()
      const stage = (label: string) =>
        console.info(
          `reservation-trace ${runId}: ${label}, ${Date.now() - began}ms`,
        )
      const evidence: Record<string, unknown> = {
        runId,
        transactionOptions: options,
      }
      stage("QA run starts")
      try {
        const f = await createReservationTraceFixture(db, scope)
        const supplier = await createFinanceSupplier(db, {
          ...f.actor,
          bookId: f.book.id,
          clientCommandId: `supplier-${runId}`,
          code: `RT-${runId.slice(0, 8)}`,
          name: "Private reservation trace supplier",
        })
        await recordFinancePurchase(db, {
          ...f.actor,
          bookId: f.book.id,
          clientCommandId: `purchase-${runId}`,
          supplierId: supplier.id,
          storeId: f.store.id,
          incurredAt: new Date("2026-09-15T12:00:00Z"),
          description: "QA original cost",
          lines: [
            {
              balanceSourceId: f.packaged.balance.id,
              enteredInventoryUnitId: f.packaged.entered.id,
              expectedConfigurationVersionId: f.packaged.version.id,
              expectedBalanceRevision: 0,
              enteredQuantity: "2",
              amountMinor: "1001",
              description: "QA retained receipt",
              categories: [{ name: `Reservation trace ${runId.slice(0, 8)}` }],
            },
          ],
        })
        await postSingleBalanceStockOperation(db, {
          ...f.actor,
          storeId: f.store.id,
          clientOperationId: `unknown-receipt-${runId}`,
          balanceSourceId: f.shared.balance.id,
          enteredInventoryUnitId: f.shared.base.id,
          enteredQuantity: "24",
          expectedBalanceRevision: 0,
          expectedConfigurationVersionId: f.shared.version.id,
          type: "receipt",
          direction: "increase",
          schemaVersion: 1,
          source: "inventory",
          reason: "QA unknown original cost",
        })
        async function commit(
          stock: typeof f.packaged,
          label: string,
          quantity: string,
        ) {
          const reservation = await reserveCatalogOfferingStock(db, {
            tenantId: f.actor.tenantId,
            storeId: f.store.id,
            offeringId: stock.offering.id,
            enteredQuantity: quantity,
            expectedConfigurationVersionId: stock.version.id,
            clientReservationId: `reserve-${label}-${runId}`,
            schemaVersion: 1,
          })
          const command = {
            ...f.actor,
            reservationId: reservation.id,
            clientOperationId: `commit-${label}-${runId}`,
            schemaVersion: 1,
            source: "inventory",
            reason: "QA standalone cost trace",
          }
          const operation = await commitCatalogStockReservation(db, command)
          const event =
            await db.financeInventoryValuationEvent.findFirstOrThrow({
              where: { stockOperationId: operation.id },
            })
          return { reservation, command, operation, event }
        }
        const first = await commit(f.packaged, "partial", "0.5")
        const last = await commit(f.packaged, "residual", "1.5")
        const unknown = await commit(f.shared, "unknown", "0.5")
        expect(first.event.sourceCostMinor).toBe(250n)
        expect(last.event.sourceCostMinor).toBe(751n)
        expect(last.event.valueAfterMinor).toBe(0n)
        expect(unknown.event.sourceCostMinor).toBeNull()
        expect(unknown.event.unknownReason).not.toBeNull()
        const journalsBefore = await db.financeJournalEntry.count({
          where: { bookId: f.book.id },
        })
        expect(journalsBefore).toBe(1)
        const eventsBefore = await db.financeInventoryValuationEvent.findMany({
          where: { bookId: f.book.id },
          orderBy: { id: "asc" },
        })
        const through = new Date()
        const context = { ...f.actor, bookId: f.book.id, through }
        const knownInput = {
          ...context,
          balanceSourceIds: [f.packaged.balance.id],
        }
        stage("known composed read starts")
        const graph = await db.$transaction(
          (tx) => readAssembly(tx, knownInput),
          options,
        )
        expect(graph.canAssemble).toBe(true)
        expect(graph.blockers).toEqual([])
        const assembly = graph.assembly
        if (!assembly)
          throw new Error("Missing registered reservation assembly")
        expect(assembly.pools).toHaveLength(1)
        expect(assembly.nodes).toHaveLength(3)
        expect(
          assembly.nodes.find(
            (n) => n.id === `movement:${first.event.stockMovementId}`,
          ),
        ).toMatchObject({
          kind: "WITHDRAWAL",
          purpose: "STANDALONE_COMMITMENT",
          quantity: "6",
          recordedCostMinor: 250n,
        })
        expect(
          assembly.nodes.find(
            (n) => n.id === `movement:${last.event.stockMovementId}`,
          ),
        ).toMatchObject({
          kind: "WITHDRAWAL",
          purpose: "STANDALONE_COMMITMENT",
          quantity: "18",
          recordedCostMinor: 751n,
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
        expect(preview.pools[0]?.valueMinor).toBe(0n)
        expect(graph.requiresClassificationProof).toBe(true)
        expect(graph.requiresConfirmationProof).toBe(true)
        evidence.known = {
          pools: assembly.pools.length,
          nodes: assembly.nodes.length,
          sourceSnapshotHash: graph.sourceSnapshotHash,
          assemblySnapshotHash: assembly.assemblySnapshotHash,
        }
        stage("known original source and full residual accepted")
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
          throw new Error("Missing UNKNOWN reservation assembly")
        expect(unknownAssembly.pools).toHaveLength(1)
        expect(unknownAssembly.nodes).toHaveLength(2)
        expect(
          unknownAssembly.nodes.find(
            (n) => n.id === `movement:${unknown.event.stockMovementId}`,
          ),
        ).toMatchObject({
          kind: "WITHDRAWAL",
          purpose: "STANDALONE_COMMITMENT",
          quantity: "6",
          recordedCostMinor: null,
        })
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
        stage("UNKNOWN alternate-unit original source accepted")
        const probes: Array<{
          label: string
          mutate: (tx: Prisma.TransactionClient) => Promise<unknown>
        }> = [
          {
            label: "saved cost",
            mutate: (tx) =>
              tx.financeInventoryValuationEvent.update({
                where: { id: first.event.id },
                data: { sourceCostMinor: 251n },
              }),
          },
          {
            label: "reservation factor",
            mutate: (tx) =>
              tx.stockReservation.update({
                where: { id: first.reservation.id },
                data: { unitFactorSnapshot: "11" },
              }),
          },
          {
            label: "committed date",
            mutate: (tx) =>
              tx.stockReservation.update({
                where: { id: first.reservation.id },
                data: { committedAt: new Date(0) },
              }),
          },
        ]
        for (const probe of probes) {
          await expect(
            db.$transaction(async (tx) => {
              await probe.mutate(tx)
              await readAssembly(tx, knownInput)
              throw new Error("UNEXPECTED_CHANGED_SOURCE_ACCEPTANCE")
            }, options),
          ).rejects.toMatchObject({ code: "CONFLICT" })
          stage(`${probe.label} refused and rolled back`)
        }
        await expect(
          db.$transaction(async (tx) => {
            await tx.financeInventoryValuationEvent.delete({
              where: { id: first.event.id },
            })
            const missing = await readAssembly(tx, knownInput)
            expect(missing.canAssemble).toBe(false)
            expect(missing.blockers).toContainEqual({
              code: "SOURCE_CONTRACT_PENDING",
              sourceId: first.operation.id,
            })
            throw new Error("QA_MISSING_EVENT_ROLLBACK")
          }, options),
        ).rejects.toThrow("QA_MISSING_EVENT_ROLLBACK")
        stage("missing original event remains a blocker and rolled back")
        expect(await commitCatalogStockReservation(db, first.command)).toEqual(
          first.operation,
        )
        const replay = await db.$transaction(
          (tx) => readAssembly(tx, knownInput),
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
        ).toBe(financePayloadHash(eventsBefore))
        expect(
          await db.financeJournalEntry.count({ where: { bookId: f.book.id } }),
        ).toBe(journalsBefore)
        expect(
          (
            await db.stockReservation.findUniqueOrThrow({
              where: { id: first.reservation.id },
            })
          ).unitFactorSnapshot.toFixed(),
        ).toBe("12")
        expect(
          (
            await db.stockReservation.findUniqueOrThrow({
              where: { id: first.reservation.id },
            })
          ).committedAt,
        ).toEqual(first.event.effectiveAt)
        evidence.mutationRollbackProbes = [
          ...probes.map((p) => p.label),
          "missing original event blocker",
        ]
        evidence.stableReplayAccepted = true
        stage("stable source and original events accepted")
      } finally {
        const remaining = await cleanupReservationTraceFixture(db, scope)
        expect(remaining).toHaveLength(31)
        expect(remaining.every((n) => n === 0)).toBe(true)
        evidence.cleanup = { checks: remaining.length, remaining }
        evidence.durationMs = Date.now() - began
        writeFileSync(
          new URL(
            "../../../../../.brain/artifacts/2026-10-02-reservation-cost-trace/live-result.json",
            import.meta.url,
          ),
          JSON.stringify(evidence, null, 2),
        )
        stage(`all ${remaining.length} cleanup checks clear`)
      }
    }, 900_000)
  },
)
