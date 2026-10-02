import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  postSingleBalanceStockOperation,
  transformPackagedStock,
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
      "Transformation trace acceptance requires exact guarded development.",
    )
}

describeWithServiceCommerceDatabase(
  "original packaged transformation trace",
  () => {
    test("conserves known residual and UNKNOWN pairs, refuses corrupted originals and replays unchanged", async () => {
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
          `transformation-trace ${runId}: ${label}, ${Date.now() - began}ms`,
        )
      const evidence: Record<string, unknown> = {
        runId,
        transactionOptions: options,
      }
      stage("QA run starts")
      try {
        const f = await createReservationTraceFixture(db, scope)
        async function packageBalance(
          stock: typeof f.packaged,
          label: string,
          factor: string,
        ) {
          const unit = await db.inventoryUnit.create({
            data: {
              configurationVersionId: stock.version.id,
              key: label,
              name: label,
              factor,
              stockBehavior: "PACKAGED_STOCK",
              transactionScale: 3,
            },
          })
          const balance = await db.stockBalanceSource.create({
            data: {
              tenantId: f.actor.tenantId,
              storeId: f.store.id,
              productId: stock.balance.productId,
              variantId: stock.balance.variantId,
              inventoryUnitId: unit.id,
              kind: "PACKAGED_STOCK",
            },
          })
          return { balance, unit, version: stock.version }
        }
        const known = {
          balance: f.packaged.balance,
          unit: f.packaged.entered,
          version: f.packaged.version,
        }
        const target = await packageBalance(f.packaged, "half", "6")
        const unknown = await packageBalance(f.shared, "unknown-case", "12")
        const unknownTarget = await packageBalance(
          f.shared,
          "unknown-half",
          "6",
        )
        const supplier = await createFinanceSupplier(db, {
          ...f.actor,
          bookId: f.book.id,
          clientCommandId: `supplier-${runId}`,
          code: `TT-${runId.slice(0, 8)}`,
          name: "Private transform source QA",
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
              balanceSourceId: known.balance.id,
              enteredInventoryUnitId: known.unit.id,
              expectedConfigurationVersionId: known.version.id,
              expectedBalanceRevision: 0,
              enteredQuantity: "2",
              amountMinor: "1001",
              description: "QA exact source",
              categories: [{ name: `Transform trace ${runId.slice(0, 8)}` }],
            },
          ],
        })
        await postSingleBalanceStockOperation(db, {
          ...f.actor,
          storeId: f.store.id,
          clientOperationId: `unknown-receipt-${runId}`,
          balanceSourceId: unknown.balance.id,
          enteredInventoryUnitId: unknown.unit.id,
          enteredQuantity: "2",
          expectedBalanceRevision: 0,
          expectedConfigurationVersionId: unknown.version.id,
          type: "receipt",
          direction: "increase",
          schemaVersion: 1,
          source: "inventory",
          reason: "QA UNKNOWN package source",
        })
        async function transform(
          from: typeof known,
          to: typeof known,
          label: string,
          sourceQuantity: string,
          targetQuantity: string,
        ) {
          const [currentSource, currentTarget] = await Promise.all([
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: from.balance.id },
            }),
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: to.balance.id },
            }),
          ])
          const command = {
            ...f.actor,
            storeId: f.store.id,
            clientOperationId: `transform-${label}-${runId}`,
            expectedConfigurationVersionId: from.version.id,
            sourceBalanceSourceId: from.balance.id,
            targetBalanceSourceId: to.balance.id,
            sourceBalanceRevision: currentSource.revision,
            targetBalanceRevision: currentTarget.revision,
            sourceQuantity,
            targetQuantity,
            schemaVersion: 1,
            source: "inventory",
            reason: "QA original paired transformation",
          }
          const operation = await transformPackagedStock(db, command)
          const events = await db.financeInventoryValuationEvent.findMany({
            where: { stockOperationId: operation.id },
          })
          const outgoing = events.find((e) => e.kind === "TRANSFER_OUT")
          const incoming = events.find((e) => e.kind === "TRANSFER_IN")
          if (!outgoing || !incoming)
            throw new Error("Missing saved transformation pair")
          expect(events).toHaveLength(2)
          return { command, operation, outgoing, incoming }
        }
        const first = await transform(known, target, "partial", "1.5", "3")
        const last = await transform(known, target, "residual", "0.5", "1")
        const unknownPair = await transform(
          unknown,
          unknownTarget,
          "unknown",
          "0.5",
          "1",
        )
        expect(first.outgoing.sourceCostMinor).toBe(751n)
        expect(first.incoming.sourceCostMinor).toBe(751n)
        expect(last.outgoing.sourceCostMinor).toBe(250n)
        expect(last.incoming.valueAfterMinor).toBe(1001n)
        expect(unknownPair.outgoing.sourceCostMinor).toBeNull()
        expect(unknownPair.incoming.valueAfterMinor).toBeNull()
        const originalEvents = await db.financeInventoryValuationEvent.findMany(
          { where: { bookId: f.book.id }, orderBy: { id: "asc" } },
        )
        const through = new Date()
        const context = { ...f.actor, bookId: f.book.id, through }
        const knownInput = { ...context, balanceSourceIds: [target.balance.id] }
        stage("known composed read starts")
        const graph = await db.$transaction(
          (tx) => readAssembly(tx, knownInput),
          options,
        )
        expect(graph.canAssemble).toBe(true)
        expect(graph.blockers).toEqual([])
        const assembly = graph.assembly
        if (!assembly) throw new Error("Missing original paired assembly")
        expect(assembly.pools).toHaveLength(2)
        expect(assembly.nodes).toHaveLength(5)
        expect(
          assembly.nodes.find(
            (n) => n.id === `movement:${first.incoming.stockMovementId}`,
          ),
        ).toMatchObject({
          kind: "TRANSFER_IN",
          sourceEventId: `movement:${first.outgoing.stockMovementId}`,
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
        expect(
          preview.pools.find((p) => p.balanceSourceId === known.balance.id)
            ?.valueMinor,
        ).toBe(0n)
        expect(
          preview.pools.find((p) => p.balanceSourceId === target.balance.id)
            ?.valueMinor,
        ).toBe(1001n)
        evidence.known = {
          pools: assembly.pools.length,
          nodes: assembly.nodes.length,
          sourceSnapshotHash: graph.sourceSnapshotHash,
          assemblySnapshotHash: assembly.assemblySnapshotHash,
        }
        stage("known pair and full residual accepted")
        const unknownGraph = await db.$transaction(
          (tx) =>
            readAssembly(tx, {
              ...context,
              balanceSourceIds: [unknownTarget.balance.id],
            }),
          options,
        )
        expect(unknownGraph.canAssemble).toBe(true)
        const unknownAssembly = unknownGraph.assembly
        if (!unknownAssembly) throw new Error("Missing UNKNOWN paired assembly")
        expect(unknownAssembly.pools).toHaveLength(2)
        expect(unknownAssembly.nodes).toHaveLength(3)
        const unknownPreview = previewReviewedInventoryCostTrace({
          ...context,
          currencyCode: "NGN",
          now: through,
          pools: unknownAssembly.pools,
          nodes: unknownAssembly.nodes,
          evidence: [],
        })
        expect(unknownPreview.completeCostTrace).toBe(false)
        expect(unknownPreview.pools.every((p) => p.valueMinor === null)).toBe(
          true,
        )
        evidence.unknown = {
          pools: unknownAssembly.pools.length,
          nodes: unknownAssembly.nodes.length,
          sourceSnapshotHash: unknownGraph.sourceSnapshotHash,
        }
        stage("UNKNOWN original pair accepted")
        const probes: Array<{
          label: string
          mutate: (tx: Prisma.TransactionClient) => Promise<unknown>
        }> = [
          {
            label: "paired allocation",
            mutate: (tx) =>
              tx.financeInventoryValuationEvent.update({
                where: { id: first.incoming.id },
                data: { sourceCostMinor: 750n },
              }),
          },
          {
            label: "retained unit factor",
            mutate: (tx) =>
              tx.stockMovement.update({
                where: { id: first.outgoing.stockMovementId ?? "" },
                data: { unitFactorSnapshot: "11" },
              }),
          },
          {
            label: "partial registration",
            mutate: (tx) =>
              tx.financeInventoryValuationEvent.delete({
                where: { id: first.incoming.id },
              }),
          },
        ]
        for (const probe of probes) {
          await expect(
            db.$transaction(async (tx) => {
              await probe.mutate(tx)
              await readAssembly(tx, knownInput)
              throw new Error("UNEXPECTED_TRANSFORMATION_ACCEPTANCE")
            }, options),
          ).rejects.toMatchObject({ code: "CONFLICT" })
          stage(`${probe.label} refused and rolled back`)
        }
        expect(await transformPackagedStock(db, first.command)).toEqual(
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
        ).toBe(financePayloadHash(originalEvents))
        expect(
          await db.financeJournalEntry.count({ where: { bookId: f.book.id } }),
        ).toBe(1)
        expect(graph.requiresMonetaryProof).toBe(true)
        expect(graph.requiresConfirmationProof).toBe(true)
        evidence.mutationRollbackProbes = probes.map((p) => p.label)
        evidence.stableReplayAccepted = true
        stage("stable paired source and original events accepted")
      } finally {
        const remaining = await cleanupReservationTraceFixture(db, scope)
        expect(remaining).toHaveLength(31)
        expect(remaining.every((n) => n === 0)).toBe(true)
        evidence.cleanup = { checks: remaining.length, remaining }
        evidence.durationMs = Date.now() - began
        writeFileSync(
          new URL(
            "../../../../../.brain/artifacts/2026-10-02-transformation-cost-trace/live-result.json",
            import.meta.url,
          ),
          JSON.stringify(evidence, null, 2),
        )
        stage(`all ${remaining.length} cleanup checks clear`)
      }
    }, 900_000)
  },
)
