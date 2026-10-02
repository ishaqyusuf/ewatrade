import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  createAndDispatchStockTransfer,
  moveInventoryCustody,
  receiveOrCancelStockTransfer,
} from "../inventory-custody-transfers"
import {
  correctStockOperation,
  postSingleBalanceStockOperation,
} from "../inventory-operations"
import { createFinanceBook } from "./accounts"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const RECEIPT_DATE = new Date("2026-09-15T12:00:00.000Z")
// This covers several remote operating paths plus verified cleanup; each
// business transaction retains its required 30-second timeout.
setDefaultTimeout(900_000)

type BalanceFixture = {
  balanceSourceId: string
  configurationVersionId: string
  enteredInventoryUnitId: string
  storeId: string
  tenantId: string
  variantId: string
}

function assertCleanup(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function stableSnapshot(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "bigint") return value.toString()
  if (Array.isArray(value)) return value.map(stableSnapshot)
  if (value && typeof value === "object") {
    const decimalLike = value as { toFixed?: () => string }
    if (typeof decimalLike.toFixed === "function") return decimalLike.toFixed()
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        stableSnapshot(nested),
      ]),
    )
  }
  return value
}

describeWithServiceCommerceDatabase(
  "custody and Store transfer cost acceptance",
  () => {
    test("preserves carrying value through custody and same-currency Store transfers", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      console.info(`Relocation acceptance QA run: ${runId}`)
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
            email: `relocation-cost-owner-${runId}@example.invalid`,
            name: "Relocation cost QA owner",
          },
        })
        actorUserIds.push(owner.id)
        const tenant = await db.tenant.create({
          data: {
            name: "Relocation cost QA",
            slug: `relocation-cost-${runId}`,
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
            email: `relocation-cost-manager-${runId}@example.invalid`,
            name: "Relocation cost QA manager",
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

        const storeA = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Relocation QA Store A",
            slug: `relocation-a-${runId}`,
            status: "ACTIVE",
            currencyCode: "NGN",
          },
        })
        const storeB = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Relocation QA Store B",
            slug: `relocation-b-${runId}`,
            status: "ACTIVE",
            currencyCode: "NGN",
          },
        })
        storeIds.push(storeA.id, storeB.id)

        const item = await db.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: `relocation-cost-${runId}`,
            kind: "PRODUCT",
            name: "Relocation carrying cost QA product",
            product: { create: {} },
            variants: {
              create: [
                { key: "known", name: "Known carrying cost", isDefault: true },
                { key: "unknown", name: "Unknown target", isDefault: false },
                { key: "legacy", name: "Legacy source", isDefault: false },
              ],
            },
          },
          include: { product: true, variants: true },
        })
        catalogItemIds.push(item.id)
        const product = item.product
        const knownVariant = item.variants.find((row) => row.key === "known")
        const unknownVariant = item.variants.find(
          (row) => row.key === "unknown",
        )
        const legacyVariant = item.variants.find((row) => row.key === "legacy")
        if (!product || !knownVariant || !unknownVariant || !legacyVariant) {
          throw new Error("Incomplete relocation-cost Product fixture")
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
              ],
            },
          },
          include: { units: true },
        })
        const canonicalUnit = configuration.units.find(
          (row) => row.key === "unit",
        )
        const caseUnit = configuration.units.find((row) => row.key === "case")
        if (!canonicalUnit || !caseUnit) {
          throw new Error("Missing canonical or packaged unit")
        }
        const configurationVersionId = configuration.id
        const canonicalUnitId = canonicalUnit.id
        const canonicalFactor = canonicalUnit.factor.toString()
        const canonicalScale = canonicalUnit.transactionScale
        const caseUnitId = caseUnit.id
        const caseFactor = caseUnit.factor.toString()
        const caseScale = caseUnit.transactionScale
        expect(canonicalFactor).toBe("1")
        expect(caseFactor).toBe("12")
        await db.catalogProduct.update({
          where: { id: productId },
          data: { currentUnitConfigurationVersionId: configurationVersionId },
        })

        async function createBalance(input: {
          storeId: string
          tenantId: string
          variantId: string
          unitId?: string
          kind?: "PACKAGED_STOCK" | "SHARED_POOL"
        }): Promise<BalanceFixture> {
          const unitId = input.unitId ?? caseUnitId
          const row = await db.stockBalanceSource.create({
            data: {
              inventoryUnitId: unitId,
              kind: input.kind ?? "PACKAGED_STOCK",
              productId,
              storeId: input.storeId,
              tenantId: input.tenantId,
              variantId: input.variantId,
            },
          })
          balanceSourceIds.push(row.id)
          return {
            balanceSourceId: row.id,
            configurationVersionId,
            enteredInventoryUnitId: unitId,
            storeId: input.storeId,
            tenantId: input.tenantId,
            variantId: input.variantId,
          }
        }

        const source = await createBalance({
          storeId: storeA.id,
          tenantId: tenant.id,
          variantId: knownVariant.id,
        })
        const target = await createBalance({
          storeId: storeB.id,
          tenantId: tenant.id,
          variantId: knownVariant.id,
        })
        const unknownTarget = await createBalance({
          storeId: storeB.id,
          tenantId: tenant.id,
          variantId: unknownVariant.id,
        })
        const unknownSource = await createBalance({
          storeId: storeA.id,
          tenantId: tenant.id,
          variantId: unknownVariant.id,
        })
        const legacySource = await createBalance({
          storeId: storeA.id,
          tenantId: tenant.id,
          variantId: legacyVariant.id,
        })

        const book = await createFinanceBook(db, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          startsAt: BOOK_START,
        })
        cleanupBookId = book.id
        const supplier = await createFinanceSupplier(db, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          bookId: book.id,
          clientCommandId: `relocation-cost-supplier-${runId}`,
          code: `RLC-${runId.slice(0, 8)}`,
          name: "Relocation cost QA supplier",
        })
        supplierId = supplier.id

        async function receive(
          balance: BalanceFixture,
          storeId: string,
          label: string,
          amountMinor: string,
          quantity: string,
          expectedRevision: number,
          incurredAt: Date,
        ) {
          return recordFinancePurchase(db, {
            tenantId: tenant.id,
            actorUserId: owner.id,
            bookId: book.id,
            clientCommandId: `relocation-cost-${label}-${runId}`,
            supplierId: supplier.id,
            storeId,
            description: `QA ${label}`,
            incurredAt,
            lines: [
              {
                balanceSourceId: balance.balanceSourceId,
                enteredInventoryUnitId: balance.enteredInventoryUnitId,
                expectedConfigurationVersionId: balance.configurationVersionId,
                description: `QA ${label}`,
                amountMinor,
                enteredQuantity: quantity,
                expectedBalanceRevision: expectedRevision,
                categories: [
                  { name: `Relocation ${label} ${runId.slice(0, 8)}` },
                ],
              },
            ],
          })
        }

        await receive(
          source,
          storeA.id,
          "source-opening",
          "2003",
          "4",
          0,
          RECEIPT_DATE,
        )
        await receive(
          target,
          storeB.id,
          "target-opening",
          "900",
          "1",
          0,
          RECEIPT_DATE,
        )

        const pool = (balance: BalanceFixture | { id: string }) => {
          const balanceSourceId =
            "balanceSourceId" in balance ? balance.balanceSourceId : balance.id
          return db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId,
              },
            },
          })
        }
        const movementsFor = (operationId: string) =>
          db.stockMovement.findMany({
            where: { operationId },
            orderBy: { balanceSourceId: "asc" },
          })
        const eventsFor = (sourceKind: string, sourceId: string) =>
          db.financeInventoryValuationEvent.findMany({
            where: { bookId: book.id, sourceKind, sourceId },
            orderBy: { sequence: "asc" },
          })
        const assertValuationPair = async (input: {
          sourceKind: string
          sourceId: string
          sourceBalanceId: string
          targetBalanceId: string
          canonical: string
          sourceCostMinor: bigint | null
          sourceUnknownReason?: FinanceInventoryUnknownReason | null
          targetUnknownReason?: FinanceInventoryUnknownReason | null
        }) => {
          const events = await eventsFor(input.sourceKind, input.sourceId)
          expect(events).toHaveLength(2)
          const outbound = events.find(
            (event) => event.balanceSourceId === input.sourceBalanceId,
          )
          const inbound = events.find(
            (event) => event.balanceSourceId === input.targetBalanceId,
          )
          if (!outbound || !inbound) {
            throw new Error("Relocation valuation pair is missing a leg")
          }
          expect(outbound.kind).toBe("TRANSFER_OUT")
          expect(inbound.kind).toBe("TRANSFER_IN")
          expect(outbound.canonicalEffect.toFixed()).toBe(`-${input.canonical}`)
          expect(inbound.canonicalEffect.toFixed()).toBe(input.canonical)
          expect(outbound.sourceCostMinor).toBe(input.sourceCostMinor)
          expect(inbound.sourceCostMinor).toBe(input.sourceCostMinor)
          expect(outbound.unknownReason).toBe(input.sourceUnknownReason ?? null)
          expect(inbound.unknownReason).toBe(input.targetUnknownReason ?? null)
          expect(outbound.stockMovementId).not.toBe(inbound.stockMovementId)
          return { events, inbound, outbound }
        }

        // A Manager may move custody. Repeating the same fresh command in parallel
        // must save one operation and one complete, costed pair.
        const assignmentInput = {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-assignment-${runId}`,
          expectedSourceRevision: 1,
          expectedTargetRevision: 0,
          quantity: "1",
          reason: "QA assign to staff custody",
          schemaVersion: 1 as const,
          source: "manager_inventory_action",
          sourceBalanceSourceId: source.balanceSourceId,
          targetCustodyReferenceId: `custodian-${runId}`,
          targetCustodyType: "staff" as const,
          tenantId: tenant.id,
        }
        const [assignment, assignmentReplay] = await Promise.all([
          moveInventoryCustody(db, assignmentInput),
          moveInventoryCustody(db, assignmentInput),
        ])
        expect(assignmentReplay.id).toBe(assignment.id)
        const assignmentMovements = await movementsFor(assignment.id)
        expect(assignmentMovements).toHaveLength(2)
        const custodyBalance = await db.stockBalanceSource.findFirstOrThrow({
          where: {
            tenantId: tenant.id,
            storeId: storeA.id,
            custodyType: "STAFF",
            custodyReferenceId: `custodian-${runId}`,
            variantId: knownVariant.id,
            inventoryUnitId: caseUnitId,
          },
        })
        balanceSourceIds.push(custodyBalance.id)
        const assignmentPair = await assertValuationPair({
          sourceKind: "INVENTORY_CUSTODY_MOVE",
          sourceId: assignment.id,
          sourceBalanceId: source.balanceSourceId,
          targetBalanceId: custodyBalance.id,
          canonical: "12",
          sourceCostMinor: BigInt(501),
        })
        expect(
          assignmentPair.events.every(
            (event) => event.actorUserId === manager.id,
          ),
        ).toBe(true)
        expect(assignmentPair.events[0]?.effectiveAt).toEqual(
          assignment.effectiveAt,
        )
        expect(assignmentPair.events[1]?.effectiveAt).toEqual(
          assignment.effectiveAt,
        )
        expect(
          assignmentMovements
            .map((row) => row.signedCanonicalEffect.toFixed())
            .sort(),
        ).toEqual(["-12", "12"])

        const custodyCostAfterAssignment = await pool(custodyBalance)
        expect(custodyCostAfterAssignment.quantity.toFixed()).toBe("12")
        expect(custodyCostAfterAssignment.valueMinor).toBe(BigInt(501))
        const sourceAfterAssignment = await pool(source)
        expect(sourceAfterAssignment.quantity.toFixed()).toBe("36")
        expect(sourceAfterAssignment.valueMinor).toBe(BigInt(1502))

        const laterReceiptDate = new Date()
        await receive(
          source,
          storeA.id,
          "later-source-receipt",
          "900",
          "1",
          2,
          laterReceiptDate,
        )
        const sourceBeforeReturns = await pool(source)
        expect(sourceBeforeReturns.quantity.toFixed()).toBe("48")
        expect(sourceBeforeReturns.valueMinor).toBe(BigInt(2402))

        const savedEventsBeforeReplay =
          await db.financeInventoryValuationEvent.findMany({
            where: { bookId: book.id, sourceId: assignment.id },
            orderBy: { sequence: "asc" },
          })
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: new Date(Date.now() + 600_000) },
        })
        try {
          const savedReplay = await moveInventoryCustody(db, assignmentInput)
          expect(savedReplay.id).toBe(assignment.id)
        } finally {
          await db.financeBook.update({
            where: { id: book.id },
            data: { closedThrough: null },
          })
        }
        expect(stableSnapshot(await movementsFor(assignment.id))).toEqual(
          stableSnapshot(assignmentMovements),
        )
        expect(
          stableSnapshot(
            await db.financeInventoryValuationEvent.findMany({
              where: { bookId: book.id, sourceId: assignment.id },
              orderBy: { sequence: "asc" },
            }),
          ),
        ).toEqual(stableSnapshot(savedEventsBeforeReplay))
        expect((await pool(custodyBalance)).valueMinor).toBe(BigInt(501))

        const returnHalfInput = {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-custody-return-half-${runId}`,
          expectedSourceRevision: 1,
          expectedTargetRevision: 3,
          quantity: "0.5",
          reason: "QA partial return from staff custody",
          schemaVersion: 1 as const,
          source: "manager_inventory_action",
          sourceBalanceSourceId: custodyBalance.id,
          targetCustodyReferenceId: "",
          targetCustodyType: "store" as const,
          tenantId: tenant.id,
        }
        const returnHalf = await moveInventoryCustody(db, returnHalfInput)
        const firstReturnPair = await assertValuationPair({
          sourceKind: "INVENTORY_CUSTODY_MOVE",
          sourceId: returnHalf.id,
          sourceBalanceId: custodyBalance.id,
          targetBalanceId: source.balanceSourceId,
          canonical: "6",
          sourceCostMinor: BigInt(250),
        })
        expect(
          firstReturnPair.events.every(
            (event) => event.actorUserId === manager.id,
          ),
        ).toBe(true)
        expect(firstReturnPair.events[0]?.effectiveAt).toEqual(
          returnHalf.effectiveAt,
        )
        const returnHalfTarget = await pool(source)
        expect(returnHalfTarget.quantity.toFixed()).toBe("54")
        expect(returnHalfTarget.valueMinor).toBe(BigInt(2652))
        const returnHalfCustody = await pool(custodyBalance)
        expect(returnHalfCustody.quantity.toFixed()).toBe("6")
        expect(returnHalfCustody.valueMinor).toBe(BigInt(251))

        const returnResidual = await moveInventoryCustody(db, {
          ...returnHalfInput,
          clientOperationId: `relocation-cost-custody-return-residual-${runId}`,
          expectedSourceRevision: 2,
          expectedTargetRevision: 4,
          quantity: "0.5",
        })
        await assertValuationPair({
          sourceKind: "INVENTORY_CUSTODY_MOVE",
          sourceId: returnResidual.id,
          sourceBalanceId: custodyBalance.id,
          targetBalanceId: source.balanceSourceId,
          canonical: "6",
          sourceCostMinor: BigInt(251),
        })
        expect((await pool(custodyBalance)).quantity.toFixed()).toBe("0")
        expect((await pool(custodyBalance)).valueMinor).toBe(BigInt(0))
        expect((await pool(source)).quantity.toFixed()).toBe("60")
        expect((await pool(source)).valueMinor).toBe(BigInt(2903))

        // The destination already has a known opening cost. Incoming carrying value
        // is added exactly, with the transfer's source allocation retained.
        const firstDispatchInput = {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-dispatch-receive-${runId}`,
          clientTransferId: `relocation-cost-transfer-receive-${runId}`,
          expectedSourceRevision: 5,
          quantity: "1.5",
          reason: "QA dispatch to Store B",
          schemaVersion: 1 as const,
          source: "manager_inventory_action",
          sourceBalanceSourceId: source.balanceSourceId,
          targetStoreId: storeB.id,
          tenantId: tenant.id,
        }
        const [dispatch, dispatchReplay] = await Promise.all([
          createAndDispatchStockTransfer(db, firstDispatchInput),
          createAndDispatchStockTransfer(db, firstDispatchInput),
        ])
        expect(dispatchReplay.id).toBe(dispatch.id)
        expect(dispatch.status).toBe("IN_TRANSIT")
        const dispatchOpId = dispatch.dispatchedOperationId
        if (
          !dispatchOpId ||
          !dispatch.transitBalanceSourceId ||
          !dispatch.dispatchedAt
        ) {
          throw new Error(
            "Dispatch did not persist its source operation/transit balance",
          )
        }
        const dispatchPair = await assertValuationPair({
          sourceKind: "STOCK_TRANSFER_DISPATCH",
          sourceId: dispatch.id,
          sourceBalanceId: source.balanceSourceId,
          targetBalanceId: dispatch.transitBalanceSourceId,
          canonical: "18",
          sourceCostMinor: BigInt(871),
        })
        const dispatchOperation = await db.stockOperation.findUniqueOrThrow({
          where: { id: dispatchOpId },
        })
        expect(
          dispatchPair.events.every(
            (event) => event.actorUserId === manager.id,
          ),
        ).toBe(true)
        expect(dispatchPair.events[0]?.effectiveAt).toEqual(
          dispatchOperation.effectiveAt,
        )
        expect(dispatchPair.events[1]?.effectiveAt).toEqual(
          dispatch.dispatchedAt,
        )
        const transit = await pool({
          ...source,
          balanceSourceId: dispatch.transitBalanceSourceId,
        })
        expect(transit.quantity.toFixed()).toBe("18")
        expect(transit.valueMinor).toBe(BigInt(871))
        const sourceAfterDispatch = await pool(source)
        expect(sourceAfterDispatch.quantity.toFixed()).toBe("42")
        expect(sourceAfterDispatch.valueMinor).toBe(BigInt(2032))

        const receiveInput = {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-receive-${runId}`,
          expectedTransitRevision: 1,
          reason: "QA receive at Store B",
          schemaVersion: 1 as const,
          source: "manager_inventory_action",
          tenantId: tenant.id,
          transferId: dispatch.id,
          transition: "receive" as const,
        }
        const received = await receiveOrCancelStockTransfer(db, receiveInput)
        expect(received.status).toBe("RECEIVED")
        const receiveOpId = received.receivedOperationId
        if (!receiveOpId || !received.receivedAt)
          throw new Error("Transfer receive lacks operation/date")
        const receivePair = await assertValuationPair({
          sourceKind: "STOCK_TRANSFER_RECEIVE",
          sourceId: dispatch.id,
          sourceBalanceId: dispatch.transitBalanceSourceId,
          targetBalanceId: target.balanceSourceId,
          canonical: "18",
          sourceCostMinor: BigInt(871),
        })
        const receiveOperation = await db.stockOperation.findUniqueOrThrow({
          where: { id: receiveOpId },
        })
        expect(
          receivePair.events.every((event) => event.actorUserId === manager.id),
        ).toBe(true)
        expect(receivePair.events[0]?.effectiveAt).toEqual(
          receiveOperation.effectiveAt,
        )
        expect(receivePair.events[1]?.effectiveAt).toEqual(received.receivedAt)
        const targetAfterReceive = await pool(target)
        expect(targetAfterReceive.quantity.toFixed()).toBe("30")
        expect(targetAfterReceive.valueMinor).toBe(BigInt(1771))
        const transferSourceJournalCount = await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: {
              in: [
                "INVENTORY_CUSTODY_MOVE",
                "STOCK_TRANSFER_DISPATCH",
                "STOCK_TRANSFER_RECEIVE",
                "STOCK_TRANSFER_CANCEL",
              ],
            },
          },
        })
        expect(transferSourceJournalCount).toBe(0)

        // A second dispatch consumes the full residual and cancellation restores it.
        const cancelDispatch = await createAndDispatchStockTransfer(db, {
          ...firstDispatchInput,
          clientOperationId: `relocation-cost-dispatch-cancel-${runId}`,
          clientTransferId: `relocation-cost-transfer-cancel-${runId}`,
          expectedSourceRevision: 6,
          quantity: "3.5",
        })
        expect(cancelDispatch.status).toBe("IN_TRANSIT")
        if (!cancelDispatch.transitBalanceSourceId) {
          throw new Error("Cancel transfer lacks transit balance")
        }
        await assertValuationPair({
          sourceKind: "STOCK_TRANSFER_DISPATCH",
          sourceId: cancelDispatch.id,
          sourceBalanceId: source.balanceSourceId,
          targetBalanceId: cancelDispatch.transitBalanceSourceId,
          canonical: "42",
          sourceCostMinor: BigInt(2032),
        })
        const cancelled = await receiveOrCancelStockTransfer(db, {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-cancel-${runId}`,
          expectedTransitRevision: 1,
          reason: "QA cancel and restore transit stock",
          schemaVersion: 1,
          source: "manager_inventory_action",
          tenantId: tenant.id,
          transferId: cancelDispatch.id,
          transition: "cancel",
        })
        expect(cancelled.status).toBe("CANCELLED")
        const cancelledOpId = cancelled.cancelledOperationId
        if (!cancelledOpId || !cancelled.cancelledAt)
          throw new Error("Transfer cancellation lacks operation/date")
        const cancelPair = await assertValuationPair({
          sourceKind: "STOCK_TRANSFER_CANCEL",
          sourceId: cancelDispatch.id,
          sourceBalanceId: cancelDispatch.transitBalanceSourceId,
          targetBalanceId: source.balanceSourceId,
          canonical: "42",
          sourceCostMinor: BigInt(2032),
        })
        const cancelledOperation = await db.stockOperation.findUniqueOrThrow({
          where: { id: cancelledOpId },
        })
        expect(
          cancelPair.events.every((event) => event.actorUserId === manager.id),
        ).toBe(true)
        expect(cancelPair.events[0]?.effectiveAt).toEqual(
          cancelledOperation.effectiveAt,
        )
        expect(cancelPair.events[1]?.effectiveAt).toEqual(cancelled.cancelledAt)
        expect((await pool(source)).quantity.toFixed()).toBe("42")
        expect((await pool(source)).valueMinor).toBe(BigInt(2032))
        expect(
          (
            await pool({
              ...source,
              balanceSourceId: cancelDispatch.transitBalanceSourceId,
            })
          ).valueMinor,
        ).toBe(BigInt(0))

        // Saved receive retries retain their original result even after a later
        // transfer and a closed period. No new transfer event is registered.
        const receiveEventsBeforeReplay = await eventsFor(
          "STOCK_TRANSFER_RECEIVE",
          dispatch.id,
        )
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: new Date(Date.now() + 600_000) },
        })
        try {
          const savedReceiveReplay = await receiveOrCancelStockTransfer(
            db,
            receiveInput,
          )
          expect(savedReceiveReplay.id).toBe(dispatch.id)
          expect(savedReceiveReplay.receivedOperationId).toBe(
            received.receivedOperationId,
          )
        } finally {
          await db.financeBook.update({
            where: { id: book.id },
            data: { closedThrough: null },
          })
        }
        expect(
          stableSnapshot(
            await eventsFor("STOCK_TRANSFER_RECEIVE", dispatch.id),
          ),
        ).toEqual(stableSnapshot(receiveEventsBeforeReplay))
        expect((await pool(target)).valueMinor).toBe(BigInt(1771))

        // New stage under a closed book is atomic: no transition status, stock, or
        // pair is written. The isolated Book closure is restored in finally.
        const closedTransfer = await createAndDispatchStockTransfer(db, {
          ...firstDispatchInput,
          clientOperationId: `relocation-cost-closed-dispatch-${runId}`,
          clientTransferId: `relocation-cost-closed-transfer-${runId}`,
          expectedSourceRevision: 8,
          quantity: "0.25",
        })
        if (!closedTransfer.transitBalanceSourceId) {
          throw new Error("Closed-period probe transfer lacks transit balance")
        }
        const closedTransitBalanceSourceId =
          closedTransfer.transitBalanceSourceId
        const closedReceiveInput = {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-closed-receive-${runId}`,
          expectedTransitRevision: 1,
          reason: "QA closed-period receive",
          schemaVersion: 1 as const,
          source: "manager_inventory_action",
          tenantId: tenant.id,
          transferId: closedTransfer.id,
          transition: "receive" as const,
        }
        const captureClosedReceive = async () => {
          const [
            transfer,
            sourceBalance,
            transitBalance,
            targetBalance,
            sourcePool,
            transitPool,
            targetPool,
            events,
            operationCount,
            movementCount,
          ] = await Promise.all([
            db.stockTransfer.findUniqueOrThrow({
              where: { id: closedTransfer.id },
            }),
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: source.balanceSourceId },
            }),
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: closedTransitBalanceSourceId },
            }),
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: target.balanceSourceId },
            }),
            pool(source),
            pool({
              ...source,
              balanceSourceId: closedTransitBalanceSourceId,
            }),
            pool(target),
            db.financeInventoryValuationEvent.findMany({
              where: { bookId: book.id, sourceId: closedTransfer.id },
              orderBy: { sequence: "asc" },
            }),
            db.stockOperation.count({
              where: {
                tenantId: tenant.id,
                clientOperationId: closedReceiveInput.clientOperationId,
              },
            }),
            db.stockMovement.count({
              where: {
                operation: {
                  tenantId: tenant.id,
                  clientOperationId: closedReceiveInput.clientOperationId,
                },
              },
            }),
          ])
          return stableSnapshot({
            transfer,
            sourceBalance,
            transitBalance,
            targetBalance,
            sourcePool,
            transitPool,
            targetPool,
            events,
            operationCount,
            movementCount,
          })
        }
        const closedReceiveBefore = await captureClosedReceive()
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: new Date(Date.now() + 600_000) },
        })
        try {
          await expect(
            receiveOrCancelStockTransfer(db, closedReceiveInput),
          ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
        } finally {
          await db.financeBook.update({
            where: { id: book.id },
            data: { closedThrough: null },
          })
        }
        expect(await captureClosedReceive()).toEqual(closedReceiveBefore)

        // A legacy source movement without a registered opening remains UNKNOWN;
        // its current custody move cannot invent the missing original cost.
        const legacySeed = await db.$transaction(
          async (tx) => {
            const operation = await tx.stockOperation.create({
              data: {
                actorUserId: owner.id,
                clientOperationId: `relocation-cost-legacy-unregistered-${runId}`,
                effectiveAt: new Date("2026-09-16T12:00:00.000Z"),
                payloadHash: `legacy-${runId}`,
                reason: "QA legacy stock history without original cost event",
                source: "legacy_acceptance_fixture",
                storeId: storeA.id,
                tenantId: tenant.id,
                type: "ADJUSTMENT",
              },
            })
            const movement = await tx.stockMovement.create({
              data: {
                balanceSourceId: legacySource.balanceSourceId,
                configurationVersionId,
                enteredInventoryUnitId: caseUnitId,
                enteredQuantity: "2",
                operationId: operation.id,
                previousOnHandQuantity: "0",
                resultingOnHandQuantity: "2",
                signedCanonicalEffect: "24",
                transactionScaleSnapshot: caseScale,
                unitFactorSnapshot: caseFactor,
              },
            })
            await tx.stockBalanceSource.update({
              where: { id: legacySource.balanceSourceId },
              data: { onHandQuantity: "2", revision: 1 },
            })
            return { operation, movement }
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
        expect(legacySeed.movement.signedCanonicalEffect.toFixed()).toBe("24")
        const legacyCustodyMove = await moveInventoryCustody(db, {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-legacy-custody-${runId}`,
          expectedSourceRevision: 1,
          quantity: "0.5",
          reason: "QA move with incomplete historical value",
          schemaVersion: 1,
          source: "manager_inventory_action",
          sourceBalanceSourceId: legacySource.balanceSourceId,
          targetCustodyReferenceId: `legacy-custodian-${runId}`,
          targetCustodyType: "staff",
          tenantId: tenant.id,
        })
        const legacyCustody = await db.stockBalanceSource.findFirstOrThrow({
          where: {
            tenantId: tenant.id,
            custodyReferenceId: `legacy-custodian-${runId}`,
          },
        })
        balanceSourceIds.push(legacyCustody.id)
        const legacyPair = await assertValuationPair({
          sourceKind: "INVENTORY_CUSTODY_MOVE",
          sourceId: legacyCustodyMove.id,
          sourceBalanceId: legacySource.balanceSourceId,
          targetBalanceId: legacyCustody.id,
          canonical: "6",
          sourceCostMinor: null,
          sourceUnknownReason: "MISSING_OPENING_COST",
          targetUnknownReason: "MISSING_OPENING_COST",
        })
        expect(
          legacyPair.events.every((event) => event.actorUserId === manager.id),
        ).toBe(true)
        expect((await pool(legacySource)).valueMinor).toBeNull()
        expect((await pool(legacyCustody)).valueMinor).toBeNull()

        // Known source allocation is carried into an UNKNOWN target as a known
        // event allocation while the destination aggregate remains UNKNOWN.
        await receive(
          unknownSource,
          storeA.id,
          "unknown-target-source",
          "1001",
          "2",
          0,
          RECEIPT_DATE,
        )
        const unknownOpening = await postSingleBalanceStockOperation(db, {
          actorUserId: manager.id,
          balanceSourceId: unknownTarget.balanceSourceId,
          categories: [
            { name: `Relocation unknown opening ${runId.slice(0, 8)}` },
          ],
          clientOperationId: `relocation-cost-unknown-target-opening-${runId}`,
          direction: "increase",
          enteredInventoryUnitId: caseUnitId,
          enteredQuantity: "1",
          expectedBalanceRevision: 0,
          expectedConfigurationVersionId: configurationVersionId,
          reason: "QA positive movement without trusted cost",
          schemaVersion: 1,
          source: "manager_inventory_action",
          storeId: storeB.id,
          tenantId: tenant.id,
          type: "adjustment",
        })
        expect(unknownOpening.movements).toHaveLength(1)
        const unknownOpeningPool = await pool(unknownTarget)
        expect(unknownOpeningPool.valueMinor).toBeNull()
        expect(unknownOpeningPool.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
        const unknownDispatch = await createAndDispatchStockTransfer(db, {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-unknown-dispatch-${runId}`,
          clientTransferId: `relocation-cost-unknown-transfer-${runId}`,
          expectedSourceRevision: 1,
          quantity: "0.5",
          reason: "QA known cost dispatch to unknown target",
          schemaVersion: 1,
          source: "manager_inventory_action",
          sourceBalanceSourceId: unknownSource.balanceSourceId,
          targetStoreId: storeB.id,
          tenantId: tenant.id,
        })
        if (!unknownDispatch.transitBalanceSourceId)
          throw new Error("Unknown-target dispatch lacks transit balance")
        const unknownDispatchPair = await assertValuationPair({
          sourceKind: "STOCK_TRANSFER_DISPATCH",
          sourceId: unknownDispatch.id,
          sourceBalanceId: unknownSource.balanceSourceId,
          targetBalanceId: unknownDispatch.transitBalanceSourceId,
          canonical: "6",
          sourceCostMinor: BigInt(250),
        })
        expect(unknownDispatchPair.inbound.unknownReason).toBeNull()
        const unknownReceive = await receiveOrCancelStockTransfer(db, {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-unknown-receive-${runId}`,
          expectedTransitRevision: 1,
          reason: "QA receive into unknown aggregate",
          schemaVersion: 1,
          source: "manager_inventory_action",
          tenantId: tenant.id,
          transferId: unknownDispatch.id,
          transition: "receive",
        })
        const unknownReceiveOperationId = unknownReceive.receivedOperationId
        if (!unknownReceiveOperationId)
          throw new Error("Unknown transfer receive lacks operation")
        const unknownReceivePair = await assertValuationPair({
          sourceKind: "STOCK_TRANSFER_RECEIVE",
          sourceId: unknownDispatch.id,
          sourceBalanceId: unknownDispatch.transitBalanceSourceId,
          targetBalanceId: unknownTarget.balanceSourceId,
          canonical: "6",
          sourceCostMinor: BigInt(250),
          targetUnknownReason: "UNCAPTURED_MOVEMENTS",
        })
        expect(unknownReceivePair.inbound.valueBeforeMinor).toBeNull()
        expect(unknownReceivePair.inbound.valueDeltaMinor).toBeNull()
        expect(unknownReceivePair.inbound.valueAfterMinor).toBeNull()
        expect((await pool(unknownTarget)).valueMinor).toBeNull()
        expect((await pool(unknownTarget)).unknownReason).toBe(
          "UNCAPTURED_MOVEMENTS",
        )

        // Backdated operation date is rejected against the source's latest saved
        // valuation date without altering either Store, transit, event, or transfer.
        const chronologyTransfer = await createAndDispatchStockTransfer(db, {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-chronology-dispatch-${runId}`,
          clientTransferId: `relocation-cost-chronology-transfer-${runId}`,
          expectedSourceRevision: 2,
          quantity: "0.25",
          reason: "QA chronology rejection probe",
          schemaVersion: 1,
          source: "manager_inventory_action",
          sourceBalanceSourceId: unknownSource.balanceSourceId,
          targetStoreId: storeB.id,
          tenantId: tenant.id,
        })
        if (!chronologyTransfer.transitBalanceSourceId)
          throw new Error("Chronology transfer lacks transit balance")
        const chronologyTransitBalanceSourceId =
          chronologyTransfer.transitBalanceSourceId
        const chronologyPool = await pool({
          id: chronologyTransitBalanceSourceId,
        })
        const latestEffectiveAt = chronologyPool.latestEffectiveAt
        await db.financeInventoryPool.update({
          where: { id: chronologyPool.id },
          data: { latestEffectiveAt: new Date(Date.now() + 3_600_000) },
        })
        const chronologyReceiveInput = {
          actorUserId: manager.id,
          clientOperationId: `relocation-cost-chronology-receive-${runId}`,
          expectedTransitRevision: 1,
          reason: "QA backdated receive rejection",
          schemaVersion: 1 as const,
          source: "manager_inventory_action",
          tenantId: tenant.id,
          transferId: chronologyTransfer.id,
          transition: "receive" as const,
        }
        const captureChronologyReceive = async () => {
          const [
            transfer,
            sourceBalance,
            transitBalance,
            targetBalance,
            transitPool,
            targetPool,
            events,
            operations,
            movements,
          ] = await Promise.all([
            db.stockTransfer.findUniqueOrThrow({
              where: { id: chronologyTransfer.id },
            }),
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: unknownSource.balanceSourceId },
            }),
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: chronologyTransitBalanceSourceId },
            }),
            db.stockBalanceSource.findUniqueOrThrow({
              where: { id: unknownTarget.balanceSourceId },
            }),
            pool({ id: chronologyTransitBalanceSourceId }),
            pool(unknownTarget),
            db.financeInventoryValuationEvent.findMany({
              where: { bookId: book.id, sourceId: chronologyTransfer.id },
              orderBy: { sequence: "asc" },
            }),
            db.stockOperation.count({
              where: {
                tenantId: tenant.id,
                clientOperationId: chronologyReceiveInput.clientOperationId,
              },
            }),
            db.stockMovement.count({
              where: {
                operation: {
                  tenantId: tenant.id,
                  clientOperationId: chronologyReceiveInput.clientOperationId,
                },
              },
            }),
          ])
          return stableSnapshot({
            transfer,
            sourceBalance,
            transitBalance,
            targetBalance,
            transitPool,
            targetPool,
            events,
            operations,
            movements,
          })
        }
        const chronologyBefore = await captureChronologyReceive()
        try {
          await expect(
            receiveOrCancelStockTransfer(db, chronologyReceiveInput),
          ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
          expect(await captureChronologyReceive()).toEqual(chronologyBefore)
        } finally {
          await db.financeInventoryPool.update({
            where: { id: chronologyPool.id },
            data: { latestEffectiveAt },
          })
        }

        // Shared balances use canonical units directly; packaged factor-12
        // coverage above must not make these canonical quantities multiply twice.
        const sharedSource = await createBalance({
          storeId: storeA.id,
          tenantId: tenant.id,
          variantId: knownVariant.id,
          unitId: canonicalUnitId,
          kind: "SHARED_POOL",
        })
        const sharedTarget = await createBalance({
          storeId: storeB.id,
          tenantId: tenant.id,
          variantId: knownVariant.id,
          unitId: canonicalUnitId,
          kind: "SHARED_POOL",
        })
        await receive(
          sharedSource,
          storeA.id,
          "shared-opening",
          "1001",
          "24",
          0,
          RECEIPT_DATE,
        )
        const sharedDispatch = await createAndDispatchStockTransfer(db, {
          ...firstDispatchInput,
          clientOperationId: `relocation-cost-shared-dispatch-${runId}`,
          clientTransferId: `relocation-cost-shared-transfer-${runId}`,
          sourceBalanceSourceId: sharedSource.balanceSourceId,
          expectedSourceRevision: 1,
          quantity: "12",
        })
        if (!sharedDispatch.transitBalanceSourceId)
          throw new Error("Shared transfer lacks transit balance")
        await assertValuationPair({
          sourceKind: "STOCK_TRANSFER_DISPATCH",
          sourceId: sharedDispatch.id,
          sourceBalanceId: sharedSource.balanceSourceId,
          targetBalanceId: sharedDispatch.transitBalanceSourceId,
          canonical: "12",
          sourceCostMinor: BigInt(500),
        })
        await receiveOrCancelStockTransfer(db, {
          ...receiveInput,
          clientOperationId: `relocation-cost-shared-receive-${runId}`,
          transferId: sharedDispatch.id,
        })
        await assertValuationPair({
          sourceKind: "STOCK_TRANSFER_RECEIVE",
          sourceId: sharedDispatch.id,
          sourceBalanceId: sharedDispatch.transitBalanceSourceId,
          targetBalanceId: sharedTarget.balanceSourceId,
          canonical: "12",
          sourceCostMinor: BigInt(500),
        })
        expect((await pool(sharedSource)).quantity.toFixed()).toBe("12")
        expect((await pool(sharedSource)).valueMinor).toBe(BigInt(501))
        expect((await pool(sharedTarget)).quantity.toFixed()).toBe("12")
        expect((await pool(sharedTarget)).valueMinor).toBe(BigInt(500))
        const sharedAssignment = await moveInventoryCustody(db, {
          ...assignmentInput,
          clientOperationId: `relocation-cost-shared-custody-${runId}`,
          sourceBalanceSourceId: sharedTarget.balanceSourceId,
          targetCustodyReferenceId: `shared-custodian-${runId}`,
          quantity: "6",
        })
        const sharedCustody = await db.stockBalanceSource.findFirstOrThrow({
          where: {
            tenantId: tenant.id,
            custodyReferenceId: `shared-custodian-${runId}`,
          },
        })
        balanceSourceIds.push(sharedCustody.id)
        await assertValuationPair({
          sourceKind: "INVENTORY_CUSTODY_MOVE",
          sourceId: sharedAssignment.id,
          sourceBalanceId: sharedTarget.balanceSourceId,
          targetBalanceId: sharedCustody.id,
          canonical: "6",
          sourceCostMinor: BigInt(250),
        })
        for (const movement of await movementsFor(sharedAssignment.id)) {
          expect(movement.unitFactorSnapshot.toFixed()).toBe(canonicalFactor)
          expect(movement.transactionScaleSnapshot).toBe(canonicalScale)
        }
        await moveInventoryCustody(db, {
          ...returnHalfInput,
          clientOperationId: `relocation-cost-shared-custody-return-${runId}`,
          sourceBalanceSourceId: sharedCustody.id,
          expectedSourceRevision: 1,
          expectedTargetRevision: 2,
          quantity: "6",
        })
        expect((await pool(sharedCustody)).valueMinor).toBe(BigInt(0))
        expect((await pool(sharedTarget)).valueMinor).toBe(BigInt(500))

        console.info(`Relocation ${runId}: costed/shared paths verified`)

        // A second Tenant has no Finance Book. Its ordinary physical stock command,
        // custody assignment/return, and Store transfer remain available without
        // synthesizing cost pools or valuation events.
        const noBookOwner = await db.user.create({
          data: {
            email: `relocation-cost-no-book-owner-${runId}@example.invalid`,
            name: "Relocation no-book QA owner",
          },
        })
        actorUserIds.push(noBookOwner.id)
        const noBookTenant = await db.tenant.create({
          data: {
            name: "Relocation no-book QA",
            slug: `relocation-no-book-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: {
                userId: noBookOwner.id,
                role: "OWNER",
                status: "ACTIVE",
              },
            },
          },
        })
        tenantIds.push(noBookTenant.id)
        const noBookManager = await db.user.create({
          data: {
            email: `relocation-cost-no-book-manager-${runId}@example.invalid`,
            name: "Relocation no-book QA manager",
          },
        })
        actorUserIds.push(noBookManager.id)
        await db.membership.create({
          data: {
            tenantId: noBookTenant.id,
            userId: noBookManager.id,
            role: "MANAGER",
            status: "ACTIVE",
          },
        })
        const noBookStoreA = await db.store.create({
          data: {
            tenantId: noBookTenant.id,
            name: "Relocation no-book Store A",
            slug: `relocation-no-book-a-${runId}`,
            status: "ACTIVE",
            currencyCode: "NGN",
          },
        })
        const noBookStoreB = await db.store.create({
          data: {
            tenantId: noBookTenant.id,
            name: "Relocation no-book Store B",
            slug: `relocation-no-book-b-${runId}`,
            status: "ACTIVE",
            currencyCode: "NGN",
          },
        })
        storeIds.push(noBookStoreA.id, noBookStoreB.id)
        const noBookItem = await db.catalogItem.create({
          data: {
            tenantId: noBookTenant.id,
            slug: `relocation-no-book-${runId}`,
            kind: "PRODUCT",
            name: "Relocation no-book QA product",
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
          throw new Error("Incomplete no-book relocation Product fixture")
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
        const noBookCase = noBookConfiguration.units.find(
          (unit) => unit.key === "case",
        )
        if (!noBookCase) throw new Error("Missing no-book packaged unit")
        const noBookConfigurationVersionId = noBookConfiguration.id
        const noBookCaseId = noBookCase.id
        await db.catalogProduct.update({
          where: { id: noBookProductId },
          data: {
            currentUnitConfigurationVersionId: noBookConfigurationVersionId,
          },
        })
        const noBookSource = await db.stockBalanceSource.create({
          data: {
            inventoryUnitId: noBookCaseId,
            kind: "PACKAGED_STOCK",
            productId: noBookProductId,
            storeId: noBookStoreA.id,
            tenantId: noBookTenant.id,
            variantId: noBookVariant.id,
          },
        })
        const noBookTarget = await db.stockBalanceSource.create({
          data: {
            inventoryUnitId: noBookCaseId,
            kind: "PACKAGED_STOCK",
            productId: noBookProductId,
            storeId: noBookStoreB.id,
            tenantId: noBookTenant.id,
            variantId: noBookVariant.id,
          },
        })
        balanceSourceIds.push(noBookSource.id, noBookTarget.id)
        await postSingleBalanceStockOperation(db, {
          actorUserId: noBookOwner.id,
          balanceSourceId: noBookSource.id,
          categories: [
            { name: `Relocation no-book seed ${runId.slice(0, 8)}` },
          ],
          clientOperationId: `relocation-cost-no-book-seed-${runId}`,
          direction: "increase",
          enteredInventoryUnitId: noBookCaseId,
          enteredQuantity: "1",
          expectedBalanceRevision: 0,
          expectedConfigurationVersionId: noBookConfigurationVersionId,
          schemaVersion: 1,
          source: "owner_inventory_action",
          storeId: noBookStoreA.id,
          tenantId: noBookTenant.id,
          type: "adjustment",
        })
        const noBookAssignment = await moveInventoryCustody(db, {
          actorUserId: noBookManager.id,
          clientOperationId: `relocation-cost-no-book-custody-${runId}`,
          expectedSourceRevision: 1,
          quantity: "0.25",
          reason: "QA no-book custody movement",
          schemaVersion: 1,
          source: "manager_inventory_action",
          sourceBalanceSourceId: noBookSource.id,
          targetCustodyReferenceId: `no-book-custodian-${runId}`,
          targetCustodyType: "staff",
          tenantId: noBookTenant.id,
        })
        const noBookCustody = await db.stockBalanceSource.findFirstOrThrow({
          where: {
            tenantId: noBookTenant.id,
            custodyReferenceId: `no-book-custodian-${runId}`,
          },
        })
        balanceSourceIds.push(noBookCustody.id)
        const noBookReturn = await moveInventoryCustody(db, {
          actorUserId: noBookManager.id,
          clientOperationId: `relocation-cost-no-book-return-${runId}`,
          expectedSourceRevision: 1,
          expectedTargetRevision: 2,
          quantity: "0.25",
          reason: "QA no-book custody return",
          schemaVersion: 1,
          source: "manager_inventory_action",
          sourceBalanceSourceId: noBookCustody.id,
          targetCustodyReferenceId: "",
          targetCustodyType: "store",
          tenantId: noBookTenant.id,
        })
        const noBookDispatch = await createAndDispatchStockTransfer(db, {
          actorUserId: noBookManager.id,
          clientOperationId: `relocation-cost-no-book-dispatch-${runId}`,
          clientTransferId: `relocation-cost-no-book-transfer-${runId}`,
          expectedSourceRevision: 3,
          quantity: "1",
          reason: "QA no-book Store dispatch",
          schemaVersion: 1,
          source: "manager_inventory_action",
          sourceBalanceSourceId: noBookSource.id,
          targetStoreId: noBookStoreB.id,
          tenantId: noBookTenant.id,
        })
        const noBookReceive = await receiveOrCancelStockTransfer(db, {
          actorUserId: noBookManager.id,
          clientOperationId: `relocation-cost-no-book-receive-${runId}`,
          expectedTransitRevision: 1,
          reason: "QA no-book Store receipt",
          schemaVersion: 1,
          source: "manager_inventory_action",
          tenantId: noBookTenant.id,
          transferId: noBookDispatch.id,
          transition: "receive",
        })
        expect(noBookAssignment.id).toBeTruthy()
        expect(noBookReturn.id).toBeTruthy()
        expect(noBookReceive.status).toBe("RECEIVED")
        expect(
          (
            await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: noBookSource.id },
            })
          ).onHandQuantity.toFixed(),
        ).toBe("0")
        expect(
          (
            await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: noBookTarget.id },
            })
          ).onHandQuantity.toFixed(),
        ).toBe("1")
        expect(
          await db.financeBook.count({ where: { tenantId: noBookTenant.id } }),
        ).toBe(0)
        expect(
          await db.financeInventoryPool.count({
            where: { tenantId: noBookTenant.id },
          }),
        ).toBe(0)
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { tenantId: noBookTenant.id },
          }),
        ).toBe(0)

        // Custody source operations cannot be rewritten by the generic correction
        // command; both stock and saved valuation facts remain unchanged.
        const assignmentMovement = assignmentMovements.find(
          (row) => row.balanceSourceId === source.balanceSourceId,
        )
        if (!assignmentMovement)
          throw new Error("Missing custody source movement")
        const custodyTargetMovement = assignmentMovements.find(
          (row) => row.balanceSourceId === custodyBalance.id,
        )
        if (!custodyTargetMovement)
          throw new Error("Missing custody target movement")
        const correctionAttempt = {
          actorUserId: owner.id,
          clientOperationId: `relocation-cost-correction-blocked-${runId}`,
          corrections: [
            {
              correctedEnteredQuantity: "0.5",
              expectedBalanceRevision: 9,
              movementId: assignmentMovement.id,
            },
            {
              correctedEnteredQuantity: "0.5",
              expectedBalanceRevision: 3,
              movementId: custodyTargetMovement.id,
            },
          ],
          reason: "QA generic correction must not rewrite custody source cost",
          schemaVersion: 1,
          source: "manager_inventory_action",
          targetOperationId: assignment.id,
          tenantId: tenant.id,
        }
        const beforeCorrectionAttempt =
          await db.financeInventoryValuationEvent.findMany({
            where: { bookId: book.id, sourceId: assignment.id },
            orderBy: { sequence: "asc" },
          })
        const correctionProtectedState = async () =>
          stableSnapshot({
            sourceBalance: await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: source.balanceSourceId },
            }),
            custodyBalance: await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: custodyBalance.id },
            }),
            sourcePool: await pool(source),
            custodyPool: await pool(custodyBalance),
            events: await eventsFor("INVENTORY_CUSTODY_MOVE", assignment.id),
            operations: await db.stockOperation.count({
              where: {
                tenantId: tenant.id,
                clientOperationId: correctionAttempt.clientOperationId,
              },
            }),
          })
        const beforeProtectedCorrection = await correctionProtectedState()
        await expect(
          correctStockOperation(db, correctionAttempt),
        ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
        expect(await correctionProtectedState()).toEqual(
          beforeProtectedCorrection,
        )
        expect(
          stableSnapshot(
            await eventsFor("INVENTORY_CUSTODY_MOVE", assignment.id),
          ),
        ).toEqual(stableSnapshot(beforeCorrectionAttempt))

        // A foreign tenant cannot transition this transfer or resolve its Book.
        const transferCountBeforeForeign = await db.stockTransfer.count({
          where: { tenantId: tenant.id },
        })
        await expect(
          receiveOrCancelStockTransfer(db, {
            actorUserId: owner.id,
            clientOperationId: `relocation-cost-foreign-receive-${runId}`,
            expectedTransitRevision: 1,
            reason: "foreign scope denial",
            schemaVersion: 1,
            source: "manager_inventory_action",
            tenantId: noBookTenant.id,
            transferId: dispatch.id,
            transition: "receive",
          }),
        ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
        expect(
          await db.stockTransfer.count({ where: { tenantId: tenant.id } }),
        ).toBe(transferCountBeforeForeign)

        // No same-account Inventory relocation journal is created.
        expect(
          await db.financeJournalEntry.count({
            where: {
              bookId: book.id,
              sourceKind: {
                in: [
                  "INVENTORY_CUSTODY_MOVE",
                  "STOCK_TRANSFER_DISPATCH",
                  "STOCK_TRANSFER_RECEIVE",
                  "STOCK_TRANSFER_CANCEL",
                ],
              },
            },
          }),
        ).toBe(0)
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
              await tx.stockTransfer.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
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
              await tx.stockOperation.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockOperationCategoryName.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockBalanceSource.updateMany({
                where: {
                  tenantId: { in: tenantIds },
                  parentBalanceSourceId: { not: null },
                },
                data: { parentBalanceSourceId: null },
              })
              await tx.stockBalanceSource.deleteMany({
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
          remainingTenantBooks,
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
          remainingTransfers,
          remainingStockCategories,
          remainingCategoryNames,
          remainingJournals,
          remainingMemberships,
        ] = await Promise.all([
          db.tenant.count({ where: { id: { in: tenantIds } } }),
          db.store.count({ where: { id: { in: storeIds } } }),
          db.catalogItem.count({ where: { id: { in: catalogItemIds } } }),
          db.user.count({ where: { id: { in: actorUserIds } } }),
          cleanupBookId
            ? db.financeBook.count({ where: { id: cleanupBookId } })
            : Promise.resolve(0),
          db.financeBook.count({ where: { tenantId: { in: tenantIds } } }),
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
          db.stockTransfer.count({ where: { tenantId: { in: tenantIds } } }),
          db.stockOperationCategory.count({
            where: { tenantId: { in: tenantIds } },
          }),
          db.stockOperationCategoryName.count({
            where: { tenantId: { in: tenantIds } },
          }),
          cleanupBookId
            ? db.financeJournalEntry.count({ where: { bookId: cleanupBookId } })
            : Promise.resolve(0),
          db.membership.count({
            where: {
              tenantId: { in: tenantIds },
              userId: { in: actorUserIds },
            },
          }),
        ])
        assertCleanup(remainingTenants === 0, "QA tenants remain after cleanup")
        assertCleanup(remainingStores === 0, "QA Stores remain after cleanup")
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
          remainingTenantBooks === 0,
          "QA tenant Finance Books remain after cleanup",
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
          remainingTransfers === 0,
          "QA Stock Transfers remain after cleanup",
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
        assertCleanup(
          remainingMemberships === 0,
          "QA memberships remain after cleanup",
        )
        console.info(`Relocation ${runId}: all 23 cleanup checks clear`)
      }
    })
  },
)
