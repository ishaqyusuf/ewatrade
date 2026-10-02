import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  createInventoryCloseout,
  finalizeInventoryCloseout,
  moveInventoryCustody,
} from "../inventory-custody-transfers"
import { recordFinancePurchase } from "./purchases"
import {
  cleanupCloseoutSourceAcceptanceFixture,
  createCloseoutSourceAcceptanceFixture,
} from "./reviewed-cost-closeout-source-acceptance-fixture"
import { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
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
      "Closeout source acceptance requires exact guarded development.",
    )
}

describeWithServiceCommerceDatabase(
  "private Closeout source composition acceptance",
  () => {
    test("proves complete shortage/gain/zero sources, rolls back mutations and replays stable original proof", async () => {
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
          `closeout-source ${runId}: ${label}, ${Date.now() - began}ms`,
        )
      const evidence: Record<string, unknown> = {
        runId,
        transactionOptions: options,
      }
      stage("QA run starts")
      try {
        const f = await createCloseoutSourceAcceptanceFixture(db, scope)
        const supplier = await createFinanceSupplier(db, {
          ...f.actor,
          bookId: f.book.id,
          clientCommandId: `supplier-${runId}`,
          code: `CS-${runId.slice(0, 8)}`,
          name: "Private Closeout source supplier",
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
              balanceSourceId: f.root.id,
              enteredInventoryUnitId: f.unit.id,
              expectedConfigurationVersionId: f.version.id,
              expectedBalanceRevision: 0,
              enteredQuantity: "4",
              amountMinor: "1001",
              description: "QA original receipt",
              categories: [{ name: `Closeout source ${runId.slice(0, 8)}` }],
            },
          ],
        })
        const received = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: f.root.id },
        })
        await moveInventoryCustody(db, {
          ...f.actor,
          clientOperationId: `custody-${runId}`,
          sourceBalanceSourceId: f.root.id,
          expectedSourceRevision: received.revision,
          quantity: "4",
          targetCustodyType: "staff",
          targetCustodyReferenceId: f.reference,
          source: "manager_inventory_action",
          reason: "QA source custody",
          schemaVersion: 1,
        })
        const custody = await db.stockBalanceSource.findFirstOrThrow({
          where: {
            parentBalanceSourceId: f.root.id,
            custodyReferenceId: f.reference,
          },
        })
        // Real ending-zero history is separate from the main physical component.
        // A zero Closeout line proves metadata, not an invented legacy baseline.
        await recordFinancePurchase(db, {
          ...f.actor,
          bookId: f.book.id,
          clientCommandId: `zero-purchase-${runId}`,
          supplierId: supplier.id,
          storeId: f.store.id,
          incurredAt: new Date("2026-09-15T12:00:00Z"),
          description: "QA ending-zero history",
          lines: [
            {
              balanceSourceId: f.zeroRoot.id,
              enteredInventoryUnitId: f.unit.id,
              expectedConfigurationVersionId: f.version.id,
              expectedBalanceRevision: 0,
              enteredQuantity: "1",
              amountMinor: "12",
              description: "QA zero-root original receipt",
              categories: [{ name: `Closeout source ${runId.slice(0, 8)}` }],
            },
          ],
        })
        await moveInventoryCustody(db, {
          ...f.actor,
          clientOperationId: `zero-custody-${runId}`,
          sourceBalanceSourceId: f.zeroRoot.id,
          expectedSourceRevision: 1,
          expectedTargetRevision: 0,
          quantity: "1",
          targetCustodyType: "staff",
          targetCustodyReferenceId: f.reference,
          source: "manager_inventory_action",
          reason: "QA actual ending-zero custody history",
          schemaVersion: 1,
        })
        await moveInventoryCustody(db, {
          ...f.actor,
          clientOperationId: `zero-return-${runId}`,
          sourceBalanceSourceId: f.zero.id,
          expectedSourceRevision: 1,
          expectedTargetRevision: 2,
          quantity: "1",
          targetCustodyType: "store",
          targetCustodyReferenceId: "",
          source: "manager_inventory_action",
          reason: "QA actual ending-zero custody return",
          schemaVersion: 1,
        })
        const zeroCurrent = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: f.zero.id },
        })
        expect(zeroCurrent.onHandQuantity.toFixed()).toBe("0")
        expect(zeroCurrent.revision).toBe(2)
        stage("separate ending-zero physical history proved")
        async function finalize(label: string, quantity: string) {
          const current = await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: custody.id },
          })
          const draft = await createInventoryCloseout(db, {
            ...f.actor,
            storeId: f.store.id,
            clientOperationId: `draft-${label}-${runId}`,
            custodyType: "staff",
            custodyReferenceId: f.reference,
            schemaVersion: 1,
            declarations: [
              {
                balanceSourceId: custody.id,
                expectedRevision: current.revision,
                declaredQuantity: quantity,
              },
              {
                balanceSourceId: f.zero.id,
                expectedRevision: zeroCurrent.revision,
                declaredQuantity: "0",
              },
            ],
          })
          const command = {
            ...f.actor,
            clientOperationId: `finalize-${label}-${runId}`,
            closeoutId: draft.id,
            reason: "QA source reconciliation",
            schemaVersion: 1 as const,
          }
          await finalizeInventoryCloseout(db, command)
          return { draft, command }
        }
        const shortage = await finalize("shortage", "3")
        const gain = await finalize("gain", "4")
        stage("two Closeouts finalized")
        const through = new Date()
        const context = { ...f.actor, bookId: f.book.id, through }
        const complete = {
          ...context,
          balanceSourceIds: [custody.id],
        }
        const events = await db.financeInventoryValuationEvent.findMany({
          where: {
            tenantId: f.actor.tenantId,
            sourceKind: "INVENTORY_CLOSEOUT",
          },
          orderBy: { id: "asc" },
        })
        const shortEvent = events.find((e) => e.sourceId === shortage.draft.id)
        const gainEvent = events.find((e) => e.sourceId === gain.draft.id)
        if (!shortEvent || !gainEvent)
          throw new Error("Missing Closeout saved events")
        expect(events).toHaveLength(2)
        expect(shortEvent.sourceCostMinor).toBe(250n)
        expect(shortEvent.valueAfterMinor).toBe(751n)
        expect(gainEvent.sourceCostMinor).toBeNull()
        expect(gainEvent.valueAfterMinor).toBeNull()
        expect(gainEvent.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
        expect(
          await db.financeInventoryValuationEvent.count({
            where: {
              balanceSourceId: f.zero.id,
              sourceKind: "INVENTORY_CLOSEOUT",
            },
          }),
        ).toBe(0)
        const journals = await db.financeJournalEntry.findMany({
          where: {
            bookId: f.book.id,
            sourceKind: "INVENTORY_CLOSEOUT_SHORTAGE",
          },
          include: { lines: { include: { account: true } } },
        })
        expect(journals).toHaveLength(1)
        expect(journals[0]?.sourceId).toBe(shortEvent.stockMovementId)
        expect(
          journals[0]?.lines
            .map((l) => [
              l.account.code,
              l.debitMinor.toString(),
              l.creditMinor.toString(),
            ])
            .sort(),
        ).toEqual([
          ["1300", "0", "250"],
          ["6000", "250", "0"],
        ])
        stage("complete composed read starts")
        const graph = await db.$transaction(
          (tx) => readAssembly(tx, complete),
          options,
        )
        expect(graph.canAssemble).toBe(true)
        expect(graph.blockers).toEqual([])
        expect(graph.assembly?.pools).toHaveLength(2)
        expect(graph.assembly?.nodes).toHaveLength(5)
        const assembly = graph.assembly
        if (!assembly) throw new Error("Missing composed Closeout assembly")
        const shortNode = assembly.nodes.find(
          (n) => n.id === `movement:${shortEvent.stockMovementId}`,
        )
        const gainNode = assembly.nodes.find(
          (n) => n.id === `movement:${gainEvent.stockMovementId}`,
        )
        expect(shortNode).toMatchObject({
          kind: "WITHDRAWAL",
          purpose: "CLOSEOUT_SHORTAGE",
          quantity: "12",
          recordedCostMinor: 250n,
        })
        expect(gainNode).toMatchObject({
          kind: "ORIGIN",
          quantity: "12",
          recordedCostMinor: null,
        })
        const preview = previewReviewedInventoryCostTrace({
          ...context,
          currencyCode: "NGN",
          now: through,
          pools: assembly.pools,
          nodes: assembly.nodes,
          evidence: [],
        })
        expect(preview.completeCostTrace).toBe(false)
        expect(preview.missingOriginEventIds).toEqual([
          `movement:${gainEvent.stockMovementId}`,
        ])
        expect(
          preview.allocations.find((a) => a.node.id === shortNode?.id)
            ?.resolvedCostMinor,
        ).toBe(250n)
        expect(
          preview.pools.find((p) => p.balanceSourceId === custody.id)
            ?.valueMinor,
        ).toBeNull()
        expect(graph.requiresMonetaryProof).toBe(true)
        expect(graph.requiresConfirmationProof).toBe(true)
        evidence.graph = {
          pools: assembly.pools.length,
          nodes: assembly.nodes.length,
          sourceSnapshotHash: graph.sourceSnapshotHash,
        }
        stage("complete composed read accepted")
        const discovered = await db.$transaction(
          (tx) =>
            discoverReviewedCostSourcesInTransaction(tx, {
              ...context,
              balanceSourceIds: [f.zero.id],
            }),
          options,
        )
        const expanded =
          discovered.sourceDocumentReferences?.some(
            (r) => r.kind === "CLOSEOUT" && r.id === shortage.draft.id,
          ) === true
        evidence.zeroRootDiscoveryAccepted = expanded
        expect(expanded).toBe(true)
        const zeroRootGraph = await db.$transaction(
          (tx) =>
            readAssembly(tx, { ...context, balanceSourceIds: [f.zero.id] }),
          options,
        )
        expect(zeroRootGraph.canAssemble).toBe(true)
        expect(zeroRootGraph.assembly?.pools).toHaveLength(4)
        expect(zeroRootGraph.assembly?.nodes).toHaveLength(10)
        const mainNodes = zeroRootGraph.assembly?.nodes.filter((n) =>
          [custody.id, f.root.id].includes(n.balanceSourceId),
        )
        // Independent physical branches change only the unrelated trace ordinal.
        const originalFacts = (nodes: typeof assembly.nodes) =>
          nodes.map(({ ordinal: _ordinal, ...node }) => node)
        expect(financePayloadHash(originalFacts(mainNodes ?? []))).toBe(
          financePayloadHash(originalFacts(assembly.nodes)),
        )
        stage("zero-root reverse document discovery accepted")
        const zeroLine = await db.inventoryCloseoutLine.findFirstOrThrow({
          where: { closeoutId: shortage.draft.id, balanceSourceId: f.zero.id },
        })
        const probes: Array<{
          label: string
          mutate: (tx: Prisma.TransactionClient) => Promise<unknown>
        }> = [
          {
            label: "zero declared quantity",
            mutate: (tx) =>
              tx.inventoryCloseoutLine.update({
                where: { id: zeroLine.id },
                data: { declaredQuantity: "1" },
              }),
          },
          {
            label: "zero custody reference",
            mutate: (tx) =>
              tx.stockBalanceSource.update({
                where: { id: f.zero.id },
                data: { custodyReferenceId: "foreign-custody" },
              }),
          },
          {
            label: "zero unit versus parent",
            mutate: (tx) =>
              tx.stockBalanceSource.update({
                where: { id: f.zero.id },
                data: { inventoryUnitId: f.alternate.id },
              }),
          },
          {
            label: "saved shortage cost",
            mutate: (tx) =>
              tx.financeInventoryValuationEvent.update({
                where: { id: shortEvent.id },
                data: { sourceCostMinor: 251n },
              }),
          },
        ]
        for (const probe of probes) {
          stage(`${probe.label} rollback probe starts`)
          await expect(
            db.$transaction(async (tx) => {
              await probe.mutate(tx)
              await readAssembly(tx, complete)
              throw new Error("UNEXPECTED_CHANGED_SOURCE_ACCEPTANCE")
            }, options),
          ).rejects.toMatchObject({ code: "CONFLICT" })
          stage(`${probe.label} rejected and rolled back`)
        }
        expect(
          (
            await db.inventoryCloseoutLine.findUniqueOrThrow({
              where: { id: zeroLine.id },
            })
          ).declaredQuantity.toFixed(),
        ).toBe("0")
        expect(
          (
            await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: f.zero.id },
            })
          ).custodyReferenceId,
        ).toBe(f.reference)
        expect(
          (
            await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: f.zero.id },
            })
          ).inventoryUnitId,
        ).toBe(f.unit.id)
        expect(
          (
            await db.financeInventoryValuationEvent.findUniqueOrThrow({
              where: { id: shortEvent.id },
            })
          ).sourceCostMinor,
        ).toBe(250n)
        await finalizeInventoryCloseout(db, gain.command)
        const replay = await db.$transaction(
          (tx) => readAssembly(tx, complete),
          options,
        )
        expect(replay.sourceSnapshotHash).toBe(graph.sourceSnapshotHash)
        expect(replay.assembly?.assemblySnapshotHash).toBe(
          assembly.assemblySnapshotHash,
        )
        const retained = await db.financeInventoryValuationEvent.findMany({
          where: {
            tenantId: f.actor.tenantId,
            sourceKind: "INVENTORY_CLOSEOUT",
          },
          orderBy: { id: "asc" },
        })
        expect(financePayloadHash(retained)).toBe(financePayloadHash(events))
        expect(
          await db.financeJournalEntry.count({
            where: {
              bookId: f.book.id,
              sourceKind: "INVENTORY_CLOSEOUT_SHORTAGE",
            },
          }),
        ).toBe(1)
        evidence.mutationRollbackProbes = probes.map((p) => p.label)
        evidence.stableReplayAccepted = true
        stage("stable replay and original event retention accepted")
      } finally {
        const remaining = await cleanupCloseoutSourceAcceptanceFixture(
          db,
          scope,
        )
        expect(remaining).toHaveLength(31)
        expect(remaining.every((n) => n === 0)).toBe(true)
        evidence.cleanup = { checks: remaining.length, remaining }
        evidence.durationMs = Date.now() - began
        writeFileSync(
          new URL(
            "../../../../../.brain/artifacts/2026-10-02-closeout-source-acceptance-batch/live-result.json",
            import.meta.url,
          ),
          JSON.stringify(evidence, null, 2),
        )
        stage("cleanup complete: all31 run-owned absence checks clear")
      }
    }, 900_000)
  },
)
