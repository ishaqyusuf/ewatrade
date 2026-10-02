import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

function assertIdentifier(value: string, label: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new FinanceError("INVALID_JOURNAL", `Invalid ${label}.`)
  }
}

function assertListOptions(input: {
  cursor?: string
  limit?: number
  bookId: string
}) {
  assertIdentifier(input.bookId, "financial book identifier")
  if (
    (input.cursor !== undefined &&
      (typeof input.cursor !== "string" ||
        !input.cursor.trim() ||
        input.cursor.length > 128)) ||
    (input.limit !== undefined &&
      (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50))
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid purchase list options.")
  }
}

function serializeEntry(entry: {
  id: string
  kind: string
  side: string
  amountMinor: bigint
  journalEntryId: string
  effectiveAt: Date
  recordedAt: Date
  actorUserId: string
  description: string
  billId: string | null
  paymentId: string | null
  moneyAccountId: string | null
  reversalOfId: string | null
}) {
  return { ...entry, amountMinor: entry.amountMinor.toString() }
}

export async function getFinancePurchaseBill(
  db: PrismaClient,
  input: FinanceActor & { bookId: string; billId: string },
) {
  assertIdentifier(input.bookId, "financial book identifier")
  assertIdentifier(input.billId, "purchase bill identifier")
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, currencyCode: true, lastSequence: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")

      const bill = await tx.financeBill.findFirst({
        where: {
          id: input.billId,
          bookId: book.id,
          kind: "PURCHASE",
          book: { tenantId: input.tenantId },
        },
        include: {
          recognitionEvent: { select: { recognitionId: true } },
          supplier: { select: { id: true, name: true } },
          lines: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              account: {
                select: { id: true, code: true, name: true, purpose: true },
              },
              purchaseReceipt: {
                include: {
                  valuationEvent: true,
                  stockOperation: {
                    select: {
                      id: true,
                      clientOperationId: true,
                      source: true,
                      type: true,
                      effectiveAt: true,
                      storeId: true,
                    },
                  },
                  stockMovement: {
                    include: {
                      balanceSource: {
                        select: {
                          id: true,
                          storeId: true,
                          productId: true,
                          variantId: true,
                          inventoryUnitId: true,
                        },
                      },
                      enteredInventoryUnit: {
                        select: {
                          id: true,
                          name: true,
                          factor: true,
                          transactionScale: true,
                        },
                      },
                      configurationVersion: {
                        select: { id: true, productId: true, version: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
      if (!bill || !bill.supplier || !bill.supplierId) {
        throw new FinanceError(
          "NOT_FOUND",
          "Purchase bill not found in this business.",
        )
      }

      const entryWhere: Prisma.FinanceSupplierEntryWhereInput = {
        bookId: book.id,
        supplierId: bill.supplierId,
      }
      const [
        paymentRows,
        supplierEntries,
        allocationRows,
        payableAccounts,
        advanceAccounts,
      ] = await Promise.all([
        tx.financeBillPayment.findMany({
          where: { bookId: book.id, billId: bill.id },
          orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
          take: 51,
          include: {
            account: { select: { id: true, name: true, purpose: true } },
            supplierEntry: { select: { id: true } },
          },
        }),
        tx.financeSupplierEntry.findMany({
          where: { ...entryWhere, billId: bill.id },
          orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
          take: 51,
          select: {
            id: true,
            kind: true,
            side: true,
            amountMinor: true,
            journalEntryId: true,
            effectiveAt: true,
            recordedAt: true,
            actorUserId: true,
            description: true,
            billId: true,
            paymentId: true,
            moneyAccountId: true,
            reversalOfId: true,
          },
        }),
        tx.financeSupplierAllocation.findMany({
          where: { bookId: book.id, billId: bill.id },
          orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
          take: 51,
          include: {
            advanceEntry: {
              select: {
                id: true,
                kind: true,
                amountMinor: true,
                journalEntryId: true,
              },
            },
            supplierEntry: { select: { id: true, journalEntryId: true } },
            releases: {
              orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
              take: 51,
              include: {
                supplierEntry: { select: { id: true, journalEntryId: true } },
              },
            },
          },
        }),
        tx.financeAccount.findMany({
          where: { bookId: book.id, purpose: "PAYABLE" },
          select: { id: true },
        }),
        tx.financeAccount.findMany({
          where: { bookId: book.id, purpose: "SUPPLIER_ADVANCE" },
          select: { id: true },
        }),
      ])

      const aggregateSupplierControl = (accountIds: string[]) =>
        accountIds.length
          ? tx.financeJournalLine.aggregate({
              where: {
                bookId: book.id,
                accountId: { in: accountIds },
                entry: {
                  sequence: { lte: book.lastSequence },
                  supplierEntries: {
                    some: {
                      ...entryWhere,
                      journalEntry: { sequence: { lte: book.lastSequence } },
                    },
                  },
                },
              },
              _sum: { debitMinor: true, creditMinor: true },
            })
          : Promise.resolve({ _sum: { debitMinor: null, creditMinor: null } })
      const [
        payableTotals,
        advanceTotals,
        allocationTotals,
        releaseTotals,
        cashPaidTotals,
      ] = await Promise.all([
        aggregateSupplierControl(payableAccounts.map((account) => account.id)),
        aggregateSupplierControl(advanceAccounts.map((account) => account.id)),
        tx.financeSupplierAllocation.aggregate({
          where: { bookId: book.id, billId: bill.id },
          _sum: { amountMinor: true },
        }),
        tx.financeSupplierAllocationRelease.aggregate({
          where: { bookId: book.id, allocation: { billId: bill.id } },
          _sum: { amountMinor: true },
        }),
        tx.financeBillPayment.aggregate({
          where: { bookId: book.id, billId: bill.id, reversedAt: null },
          _sum: { amountMinor: true },
        }),
      ])

      const payableMinor =
        (payableTotals._sum.creditMinor ?? BigInt(0)) -
        (payableTotals._sum.debitMinor ?? BigInt(0))
      const advanceMinor =
        (advanceTotals._sum.debitMinor ?? BigInt(0)) -
        (advanceTotals._sum.creditMinor ?? BigInt(0))
      const allocatedMinor = allocationTotals._sum.amountMinor ?? BigInt(0)
      const releasedMinor = releaseTotals._sum.amountMinor ?? BigInt(0)
      const consumedAllocationMinor = allocatedMinor - releasedMinor
      const cashPaidMinor = cashPaidTotals._sum.amountMinor ?? BigInt(0)
      const outstandingMinor = bill.voidedAt
        ? BigInt(0)
        : bill.totalMinor - bill.paidMinor
      const payments = paymentRows.slice(0, 50)
      const entries = supplierEntries.slice(0, 50)
      const allocations = allocationRows.slice(0, 50)

      return {
        id: bill.id,
        bookId: bill.bookId,
        supplier: bill.supplier,
        supplierId: bill.supplierId,
        payeeName: bill.payeeName,
        kind: bill.kind,
        reference: bill.reference,
        description: bill.description,
        incurredAt: bill.incurredAt,
        dueAt: bill.dueAt,
        storeId: bill.storeId,
        totalMinor: bill.totalMinor.toString(),
        paidMinor: bill.paidMinor.toString(),
        cashPaidMinor: cashPaidMinor.toString(),
        allocatedMinor: allocatedMinor.toString(),
        activeAllocatedMinor: consumedAllocationMinor.toString(),
        releasedAllocationMinor: releasedMinor.toString(),
        outstandingMinor: outstandingMinor.toString(),
        voidedAt: bill.voidedAt,
        voidEffectiveAt: bill.voidEffectiveAt,
        voidedById: bill.voidedById,
        voidReason: bill.voidReason,
        actorUserId: bill.actorUserId,
        createdAt: bill.createdAt,
        currencyCode: book.currencyCode,
        currentSupplierTotals: {
          payableMinor: payableMinor.toString(),
          advanceMinor: advanceMinor.toString(),
          throughJournalSequence: book.lastSequence.toString(),
        },
        coverage: {
          receipts: bill.recognitionEvent
            ? "SEPARATE_RECOGNITION_SOURCE"
            : "LINKED_MOVEMENT_PER_LINE",
          valuation: bill.recognitionEvent
            ? "SEPARATE_RECOGNITION_SOURCE"
            : bill.lines.every((line) => line.purchaseReceipt?.valuationEvent)
              ? "PURCHASE_RECEIPTS_ONLY"
              : "NOT_REGISTERED",
          cogs: "NOT_IMPLEMENTED",
        },
        recognitionId: bill.recognitionEvent?.recognitionId ?? null,
        lines: bill.lines.map((line) => {
          const receipt = line.purchaseReceipt
          const movement = receipt?.stockMovement
          return {
            id: line.id,
            position: line.position,
            description: line.description,
            amountMinor: line.amountMinor.toString(),
            account: line.account,
            receipt: receipt
              ? {
                  id: receipt.id,
                  tenantId: receipt.tenantId,
                  stockOperationId: receipt.stockOperationId,
                  stockMovementId: receipt.stockMovementId,
                  valuation: receipt.valuationEvent
                    ? {
                        id: receipt.valuationEvent.id,
                        status:
                          receipt.valuationEvent.valueAfterMinor === null
                            ? "UNKNOWN"
                            : "KNOWN",
                        sequence: receipt.valuationEvent.sequence.toString(),
                        quantityBefore:
                          receipt.valuationEvent.quantityBefore.toFixed(),
                        quantityAfter:
                          receipt.valuationEvent.quantityAfter.toFixed(),
                        valueBeforeMinor:
                          receipt.valuationEvent.valueBeforeMinor?.toString() ??
                          null,
                        valueAfterMinor:
                          receipt.valuationEvent.valueAfterMinor?.toString() ??
                          null,
                        sourceCostMinor:
                          receipt.valuationEvent.sourceCostMinor?.toString() ??
                          null,
                        unknownReason: receipt.valuationEvent.unknownReason,
                        effectiveAt: receipt.valuationEvent.effectiveAt,
                      }
                    : null,
                  operation: receipt.stockOperation,
                  movement: movement
                    ? {
                        id: movement.id,
                        balanceSourceId: movement.balanceSourceId,
                        configurationVersionId: movement.configurationVersionId,
                        enteredInventoryUnitId: movement.enteredInventoryUnitId,
                        enteredQuantity: movement.enteredQuantity.toString(),
                        transactionScaleSnapshot:
                          movement.transactionScaleSnapshot,
                        unitFactorSnapshot:
                          movement.unitFactorSnapshot.toString(),
                        signedCanonicalEffect:
                          movement.signedCanonicalEffect.toString(),
                        previousOnHandQuantity:
                          movement.previousOnHandQuantity.toString(),
                        resultingOnHandQuantity:
                          movement.resultingOnHandQuantity.toString(),
                        unitCostMinorSnapshot: movement.unitCostMinorSnapshot,
                        totalCostMinorSnapshot:
                          movement.totalCostMinorSnapshot?.toString() ?? null,
                        currencyCodeSnapshot: movement.currencyCodeSnapshot,
                        balanceSource: movement.balanceSource,
                        enteredInventoryUnit: {
                          ...movement.enteredInventoryUnit,
                          factor:
                            movement.enteredInventoryUnit.factor.toString(),
                        },
                        configurationVersion: movement.configurationVersion,
                      }
                    : null,
                }
              : null,
          }
        }),
        payments: payments.map((payment) => ({
          id: payment.id,
          accountId: payment.accountId,
          account: payment.account,
          amountMinor: payment.amountMinor.toString(),
          effectiveAt: payment.effectiveAt,
          reference: payment.reference,
          reversedAt: payment.reversedAt,
          reversalEffectiveAt: payment.reversalEffectiveAt,
          reversedById: payment.reversedById,
          reversalReason: payment.reversalReason,
          actorUserId: payment.actorUserId,
          createdAt: payment.createdAt,
          supplierEntryId: payment.supplierEntry?.id ?? null,
        })),
        paymentsHasMore: paymentRows.length > 50,
        supplierEntries: entries.map(serializeEntry),
        supplierEntriesHasMore: supplierEntries.length > 50,
        allocations: allocations.map((allocation) => {
          const releases = allocation.releases.slice(0, 50)
          return {
            id: allocation.id,
            supplierId: allocation.supplierId,
            billId: allocation.billId,
            advanceEntryId: allocation.advanceEntryId,
            advanceEntry: {
              ...allocation.advanceEntry,
              amountMinor: allocation.advanceEntry.amountMinor.toString(),
            },
            supplierEntryId: allocation.supplierEntryId,
            amountMinor: allocation.amountMinor.toString(),
            effectiveAt: allocation.effectiveAt,
            actorUserId: allocation.actorUserId,
            createdAt: allocation.createdAt,
            releases: releases.map((release) => ({
              id: release.id,
              supplierEntryId: release.supplierEntryId,
              supplierEntry: release.supplierEntry,
              amountMinor: release.amountMinor.toString(),
              effectiveAt: release.effectiveAt,
              actorUserId: release.actorUserId,
              reason: release.reason,
              createdAt: release.createdAt,
            })),
            releasesHasMore: allocation.releases.length > 50,
          }
        }),
        allocationsHasMore: allocationRows.length > 50,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

export type FinancePurchaseListInput = FinanceActor & {
  bookId: string
  supplierId?: string
  storeId?: string
  status?: "UNPAID" | "PARTIAL" | "PAID" | "VOID"
  cursor?: string
  limit?: number
}

export async function listFinancePurchaseBills(
  db: PrismaClient,
  input: FinancePurchaseListInput,
) {
  assertListOptions(input)
  if (input.supplierId !== undefined) {
    assertIdentifier(input.supplierId, "supplier identifier")
  }
  if (input.storeId !== undefined)
    assertIdentifier(input.storeId, "Store identifier")
  if (
    input.status !== undefined &&
    !["UNPAID", "PARTIAL", "PAID", "VOID"].includes(input.status)
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid purchase status filter.")
  }
  const limit = input.limit ?? 30
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, currencyCode: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")

      const where: Prisma.FinanceBillWhereInput = {
        bookId: book.id,
        kind: "PURCHASE",
        supplierId: input.supplierId,
        storeId: input.storeId,
        ...(input.status === "VOID"
          ? { voidedAt: { not: null } }
          : { voidedAt: null }),
        ...(input.status === "UNPAID"
          ? { paidMinor: BigInt(0) }
          : input.status === "PAID"
            ? { paidMinor: { equals: tx.financeBill.fields.totalMinor } }
            : input.status === "PARTIAL"
              ? {
                  paidMinor: {
                    gt: BigInt(0),
                    lt: tx.financeBill.fields.totalMinor,
                  },
                }
              : {}),
      }
      const cursor = input.cursor
        ? await tx.financeBill.findFirst({
            where: { AND: [where, { id: input.cursor }] },
            select: { id: true, incurredAt: true },
          })
        : null
      if (input.cursor && !cursor) {
        throw new FinanceError(
          "CONFLICT",
          "The purchase list changed. Refresh to continue.",
        )
      }
      const pageWhere: Prisma.FinanceBillWhereInput = cursor
        ? {
            AND: [
              where,
              {
                OR: [
                  { incurredAt: { lt: cursor.incurredAt } },
                  { incurredAt: cursor.incurredAt, id: { lt: cursor.id } },
                ],
              },
            ],
          }
        : where
      const summaryWhere = where
      const [rows, totals, count] = await Promise.all([
        tx.financeBill.findMany({
          where: pageWhere,
          orderBy: [{ incurredAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          include: { supplier: { select: { id: true, name: true } } },
        }),
        tx.financeBill.aggregate({
          where: summaryWhere,
          _sum: { totalMinor: true, paidMinor: true },
        }),
        tx.financeBill.count({ where }),
      ])
      const page = rows.slice(0, limit)
      const totalMinor = totals._sum.totalMinor ?? BigInt(0)
      const paidMinor = totals._sum.paidMinor ?? BigInt(0)
      return {
        currencyCode: book.currencyCode,
        count,
        summary: {
          incurredMinor: totalMinor.toString(),
          paidMinor: paidMinor.toString(),
          outstandingMinor:
            input.status === "VOID" ? "0" : (totalMinor - paidMinor).toString(),
          coverage: "SETTLED_AGAINST_BILLS",
        },
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
        items: page.map((bill) => ({
          id: bill.id,
          supplierId: bill.supplierId,
          supplier: bill.supplier,
          payeeName: bill.payeeName,
          description: bill.description,
          reference: bill.reference,
          incurredAt: bill.incurredAt,
          dueAt: bill.dueAt,
          storeId: bill.storeId,
          totalMinor: bill.totalMinor.toString(),
          paidMinor: bill.paidMinor.toString(),
          outstandingMinor: bill.voidedAt
            ? "0"
            : (bill.totalMinor - bill.paidMinor).toString(),
          status: bill.voidedAt
            ? ("VOID" as const)
            : bill.paidMinor === bill.totalMinor
              ? ("PAID" as const)
              : bill.paidMinor > BigInt(0)
                ? ("PARTIAL" as const)
                : ("UNPAID" as const),
        })),
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
