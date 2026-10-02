import {
  type StockCategorySelector,
  normalizeStockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { postSingleBalanceStockOperationInTransaction } from "../inventory-operations"
import type { FinanceActor } from "./access"
import { assertFinanceManager } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import {
  getPurchaseControlAccount,
  purchaseJournalEntryId,
  requirePurchaseDate,
} from "./purchase-source"
import {
  FinanceError,
  MAX_FINANCE_AMOUNT,
  assertFinancePostingDate,
  financeAmount,
} from "./rules"
import { recordPurchaseReceiptValuationInTransaction } from "./valuation-receipts"

export type FinancePurchaseLineInput = {
  balanceSourceId: string
  description: string
  amountMinor: string
  enteredQuantity: string
  enteredInventoryUnitId: string
  expectedBalanceRevision: number
  expectedConfigurationVersionId: string
  categories: StockCategorySelector[]
}

export type FinancePurchaseInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  supplierId: string
  storeId: string
  description: string
  reference?: string
  incurredAt: Date
  dueAt?: Date
  lines: FinancePurchaseLineInput[]
}

function validateText(value: string, label: string, maximum: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new FinanceError("INVALID_JOURNAL", `Enter a valid ${label}.`)
  }
}

function validatePurchaseInput(input: FinancePurchaseInput) {
  validateText(input.description, "purchase description", 400)
  if (
    (input.reference !== undefined &&
      (typeof input.reference !== "string" || input.reference.length > 160)) ||
    !Number.isFinite(input.incurredAt.getTime()) ||
    (input.dueAt !== undefined &&
      (!Number.isFinite(input.dueAt.getTime()) ||
        input.dueAt < input.incurredAt))
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Check the purchase dates and reference.",
    )
  }
  if (
    !Array.isArray(input.lines) ||
    input.lines.length < 1 ||
    input.lines.length > 10
  ) {
    throw new FinanceError("INVALID_JOURNAL", "A purchase requires 1–10 lines.")
  }
  const seenBalances = new Set<string>()
  const lines = input.lines.map((line, position) => {
    validateText(line.balanceSourceId, "Balance Source", 128)
    validateText(line.description, "line description", 200)
    validateText(line.enteredInventoryUnitId, "Inventory Unit", 128)
    validateText(
      line.expectedConfigurationVersionId,
      "configuration version",
      128,
    )
    if (
      !Number.isInteger(line.expectedBalanceRevision) ||
      line.expectedBalanceRevision < 0 ||
      line.expectedBalanceRevision > 2_147_483_647 ||
      !Array.isArray(line.categories) ||
      line.categories.length === 0 ||
      typeof line.enteredQuantity !== "string" ||
      !line.enteredQuantity.trim()
    ) {
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Check the purchase line details.",
      )
    }
    if (seenBalances.has(line.balanceSourceId)) {
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Each purchase line must use a distinct Balance Source.",
      )
    }
    seenBalances.add(line.balanceSourceId)
    let categories: StockCategorySelector[]
    try {
      categories = normalizeStockCategorySelectors(line.categories)
    } catch (error) {
      throw new FinanceError(
        "INVALID_JOURNAL",
        error instanceof Error ? error.message : "Invalid stock categories.",
      )
    }
    return {
      ...line,
      categories,
      description: line.description.trim(),
      amount: financeAmount(line.amountMinor),
      position,
    }
  })
  const totalMinor = lines.reduce(
    (total, line) => total + line.amount,
    BigInt(0),
  )
  if (totalMinor > MAX_FINANCE_AMOUNT) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Purchase total exceeds the transaction limit.",
    )
  }
  return { lines, totalMinor }
}

export async function recordFinancePurchaseInTransaction(
  tx: Prisma.TransactionClient,
  input: FinancePurchaseInput,
) {
  const { lines, totalMinor } = validatePurchaseInput(input)
  requirePurchaseDate(input.incurredAt)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  const commandPayload = {
    ...payload,
    description: input.description.trim(),
    reference: input.reference?.trim() || null,
    lines: lines.map(({ amount, ...line }) => ({
      ...line,
      amountMinor: amount.toString(),
    })),
  }

  return financeDocumentCommand(
    tx,
    input,
    "RECORD_PURCHASE",
    commandPayload,
    async (book) => {
      const tenant = await assertFinanceManager(tx, input)
      assertFinancePostingDate({
        effectiveAt: input.incurredAt,
        startsAt: book.startsAt,
        closedThrough: book.closedThrough,
        now: new Date(),
      })
      if (tenant.currencyCode !== book.currencyCode) {
        throw new FinanceError(
          "CONFLICT",
          "The financial book currency no longer matches the business currency.",
        )
      }
      if (input.dueAt && input.dueAt < input.incurredAt) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The purchase due date cannot precede its incurred date.",
        )
      }
      const [supplier, store] = await Promise.all([
        tx.financeSupplierAccount.findFirst({
          where: { id: input.supplierId, bookId: book.id },
          select: { id: true, name: true },
        }),
        tx.store.findFirst({
          where: {
            id: input.storeId,
            tenantId: input.tenantId,
            currencyCode: book.currencyCode,
          },
          select: { id: true },
        }),
      ])
      if (!supplier) {
        throw new FinanceError("NOT_FOUND", "Supplier not found in this book.")
      }
      if (!store) {
        throw new FinanceError(
          "NOT_FOUND",
          "Choose a Store using this business currency.",
        )
      }
      const inventory = await getPurchaseControlAccount(
        tx,
        book.id,
        "1300",
        "ASSET",
        "INVENTORY",
      )
      const payable = await getPurchaseControlAccount(
        tx,
        book.id,
        "2000",
        "LIABILITY",
        "PAYABLE",
      )
      const bill = await tx.financeBill.create({
        data: {
          bookId: book.id,
          supplierId: supplier.id,
          kind: "PURCHASE",
          payeeName: supplier.name,
          description: input.description.trim(),
          reference: input.reference?.trim() || null,
          incurredAt: input.incurredAt,
          dueAt: input.dueAt,
          storeId: store.id,
          totalMinor,
          actorUserId: input.actorUserId,
        },
      })

      for (const line of lines) {
        const billLine = await tx.financeBillLine.create({
          data: {
            bookId: book.id,
            billId: bill.id,
            accountId: inventory.id,
            position: line.position,
            description: line.description,
            amountMinor: line.amount,
          },
        })
        const clientOperationId = financePostingCommandId(
          input.clientCommandId,
          `purchase-stock:${book.id}:${line.position}`,
        )
        const priorOperation = await tx.stockOperation.findUnique({
          where: {
            tenantId_clientOperationId: {
              tenantId: input.tenantId,
              clientOperationId,
            },
          },
          select: { id: true },
        })
        if (priorOperation) {
          throw new FinanceError(
            "CONFLICT",
            "The purchase stock identity already exists outside this command.",
          )
        }
        const operation = await postSingleBalanceStockOperationInTransaction(
          tx,
          {
            actorUserId: input.actorUserId,
            balanceSourceId: line.balanceSourceId,
            clientOperationId,
            direction: "increase",
            effectiveAt: input.incurredAt,
            enteredInventoryUnitId: line.enteredInventoryUnitId,
            enteredQuantity: line.enteredQuantity,
            expectedBalanceRevision: line.expectedBalanceRevision,
            expectedConfigurationVersionId: line.expectedConfigurationVersionId,
            categories: line.categories,
            reason: line.description,
            schemaVersion: 1,
            source: "finance_purchase",
            storeId: store.id,
            tenantId: input.tenantId,
            type: "receipt",
          },
        )
        const movement = operation.movements[0]
        if (operation.movements.length !== 1 || !movement) {
          throw new FinanceError(
            "CONFLICT",
            "The purchase receipt did not produce one movement.",
          )
        }
        const receipt = await tx.financePurchaseReceiptLine.create({
          data: {
            tenantId: input.tenantId,
            bookId: book.id,
            billLineId: billLine.id,
            stockOperationId: operation.id,
            stockMovementId: movement.id,
          },
        })
        await recordPurchaseReceiptValuationInTransaction(tx, {
          tenantId: input.tenantId,
          bookId: book.id,
          receiptId: receipt.id,
          actorUserId: input.actorUserId,
          expectedStockRevision: line.expectedBalanceRevision + 1,
        })
      }

      const journal = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "purchase-journal",
        ),
        sourceKind: "PURCHASE_BILL",
        sourceId: bill.id,
        description: input.description.trim(),
        effectiveAt: input.incurredAt,
        storeId: store.id,
        lines: [
          {
            accountId: inventory.id,
            side: "DEBIT",
            amountMinor: totalMinor.toString(),
          },
          {
            accountId: payable.id,
            side: "CREDIT",
            amountMinor: totalMinor.toString(),
          },
        ],
      })
      await tx.financeSupplierEntry.create({
        data: {
          bookId: book.id,
          supplierId: supplier.id,
          kind: "PURCHASE_BILL",
          side: "CREDIT",
          amountMinor: totalMinor,
          journalEntryId: purchaseJournalEntryId(journal),
          effectiveAt: input.incurredAt,
          actorUserId: input.actorUserId,
          description: input.description.trim(),
          billId: bill.id,
        },
      })
      return { id: bill.id }
    },
  )
}

export async function recordFinancePurchase(
  db: PrismaClient,
  input: FinancePurchaseInput,
) {
  return db.$transaction(
    (tx) => recordFinancePurchaseInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}
