import { createHash } from "node:crypto"
import { normalizeStockCategoryName } from "@ewatrade/utils/inventory-categories"
import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import {
  previewPurchaseStockReceipts,
  preparePurchaseStockReceiptsInTransaction,
} from "../inventory-operations"
import { assertFinanceManager } from "./access"
import { normalizeFinancePurchase } from "./purchase-recording-input"
import { getPurchaseControlAccount } from "./purchase-source"
import type { FinancePurchaseInput } from "./purchases"
import { FinanceError, assertFinancePostingDate } from "./rules"
import { calculatePurchaseReceiptValuation } from "./valuation-receipt-impact"
import { addQuantities } from "./valuation-math"
export type FinancePurchaseReviewInput = Omit<
  FinancePurchaseInput,
  "clientCommandId"
>
/** Shared canonical header proof. No supplied owner or controls are accepted. */
export async function resolveFinancePurchaseRecordingSource(
  tx: Prisma.TransactionClient,
  input: FinancePurchaseReviewInput,
  book: FinanceBook,
) {
  const normalized = normalizeFinancePurchase({
    ...input,
    clientCommandId: "review",
  })
  const tenant = await assertFinanceManager(tx, input)
  if (book.id !== input.bookId || book.tenantId !== input.tenantId)
    throw new FinanceError("NOT_FOUND", "Financial book not found.")
  assertFinancePostingDate({
    effectiveAt: input.incurredAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  if (tenant.currencyCode !== book.currencyCode)
    throw new FinanceError(
      "CONFLICT",
      "The financial book currency no longer matches the business currency.",
    )
  const supplier = await tx.financeSupplierAccount.findFirst({
    where: { id: input.supplierId, bookId: book.id },
    select: { id: true, bookId: true, name: true, code: true },
  })
  const store = await tx.store.findFirst({
    where: {
      id: input.storeId,
      tenantId: input.tenantId,
      currencyCode: book.currencyCode,
    },
    select: { id: true, tenantId: true, currencyCode: true, name: true },
  })
  if (!supplier || supplier.bookId !== book.id)
    throw new FinanceError("NOT_FOUND", "Supplier not found in this book.")
  if (
    !store ||
    store.tenantId !== input.tenantId ||
    store.currencyCode !== book.currencyCode
  )
    throw new FinanceError(
      "NOT_FOUND",
      "Choose a Store using this business currency.",
    )
  const inventory = await getPurchaseControlAccount(
      tx,
      book.id,
      "1300",
      "ASSET",
      "INVENTORY",
    ),
    payable = await getPurchaseControlAccount(
      tx,
      book.id,
      "2000",
      "LIABILITY",
      "PAYABLE",
    )
  if (inventory.bookId !== book.id || payable.bookId !== book.id)
    throw new FinanceError(
      "CONFLICT",
      "Purchase controls must belong to the financial book.",
    )
  return { ...normalized, supplier, store, inventory, payable }
}
export function financePurchaseStockInput(input: FinancePurchaseReviewInput) {
  return {
    tenantId: input.tenantId,
    storeId: input.storeId,
    lines: input.lines.map((l) => ({
      balanceSourceId: l.balanceSourceId,
      enteredInventoryUnitId: l.enteredInventoryUnitId,
      enteredQuantity: l.enteredQuantity,
      expectedConfigurationVersionId: l.expectedConfigurationVersionId,
    })),
  }
}
export type FinancePurchaseRecordingSource = Awaited<
  ReturnType<typeof resolveFinancePurchaseRecordingSource>
>
export async function composeFinancePurchaseRecordingReview(
  tx: Prisma.TransactionClient,
  input: FinancePurchaseReviewInput,
  book: FinanceBook,
  source: FinancePurchaseRecordingSource,
  stock: Awaited<ReturnType<typeof previewPurchaseStockReceipts>>,
) {
  const ids = source.lines.map((l) => l.balanceSourceId)
  if (stock.size !== ids.length || ids.some((id) => !stock.has(id)))
    throw new FinanceError(
      "CONFLICT",
      "The complete purchase stock preview is unavailable.",
    )
  const pools = await tx.financeInventoryPool.findMany({
    where: {
      bookId: book.id,
      tenantId: input.tenantId,
      balanceSourceId: { in: ids },
    },
    take: 11,
  })
  const movements = await tx.stockMovement.groupBy({
    by: ["balanceSourceId"],
    where: { balanceSourceId: { in: ids } },
    _count: { _all: true },
  })
  const selectors = source.lines.flatMap((l) => l.categories),
    categoryIds = selectors.flatMap((s) =>
      "categoryNameId" in s ? [s.categoryNameId] : [],
    ),
    categoryNames = selectors.flatMap((s) =>
      "name" in s ? [normalizeStockCategoryName(s.name).normalizedName] : [],
    )
  const categoryRows = await tx.stockOperationCategoryName.findMany({
    where: {
      tenantId: input.tenantId,
      OR: [
        { id: { in: categoryIds } },
        { normalizedName: { in: categoryNames } },
      ],
    },
    take: 101,
  })
  if (pools.length > ids.length || categoryRows.length > 100)
    throw new FinanceError(
      "CONFLICT",
      "The purchase source exceeds its complete review bounds.",
    )
  const goods = source.lines.map((line) => {
    const current = stock.get(line.balanceSourceId)!
    if (
      current.currencyCode !== book.currencyCode ||
      current.configurationVersionId !== line.expectedConfigurationVersionId ||
      current.revision !== line.expectedBalanceRevision ||
      !Number.isInteger(current.revision) ||
      current.revision < 0 ||
      current.revision >= 2147483647
    )
      throw new FinanceError(
        "CONFLICT",
        "Refresh the purchase stock configuration and revision.",
      )
    const pool =
        pools.find((p) => p.balanceSourceId === line.balanceSourceId) ?? null,
      movementCount =
        movements.find((m) => m.balanceSourceId === line.balanceSourceId)
          ?._count._all ?? 0
    const impact = calculatePurchaseReceiptValuation({
      quantityBefore: current.canonicalBefore,
      canonicalEffect: current.canonicalQuantity,
      quantityAfter: addQuantities(
        current.canonicalBefore,
        current.canonicalQuantity,
      ),
      sourceCostMinor: line.amount,
      effectiveAt: input.incurredAt,
      movementCount: movementCount + 1,
      pool,
    })
    const categories = new Map<
      string,
      { categoryNameId: number | null; name: string; willCreate: boolean }
    >()
    for (const selector of line.categories) {
      const c =
        "categoryNameId" in selector
          ? categoryRows.find((c) => c.id === selector.categoryNameId)
          : categoryRows.find(
              (c) =>
                c.normalizedName ===
                normalizeStockCategoryName(selector.name).normalizedName,
            )
      if ("categoryNameId" in selector && !c)
        throw new FinanceError(
          "CONFLICT",
          "The purchase category is unavailable in this business.",
        )
      const name =
        c?.name ??
        ("name" in selector
          ? normalizeStockCategoryName(selector.name).name
          : "")
      categories.set(c ? `id:${c.id}` : `name:${name}`, {
        categoryNameId: c?.id ?? null,
        name,
        willCreate: !c,
      })
    }
    return {
      position: line.position,
      description: line.description,
      amountMinor: line.amount.toString(),
      balanceSourceId: line.balanceSourceId,
      enteredInventoryUnitId: line.enteredInventoryUnitId,
      enteredQuantity: current.enteredQuantity,
      enteredUnitName: current.enteredUnitName,
      configurationVersionId: line.expectedConfigurationVersionId,
      stock: { ...current },
      categories: [...categories.values()],
      valuation: {
        status: impact.status,
        sourceCostMinor: impact.sourceCostMinor.toString(),
        quantityBefore: impact.quantityBefore,
        canonicalEffect: impact.canonicalEffect,
        quantityAfter: impact.quantityAfter,
        valueBeforeMinor: impact.valueBeforeMinor?.toString() ?? null,
        valueDeltaMinor: impact.valueDeltaMinor?.toString() ?? null,
        valueAfterMinor: impact.valueAfterMinor?.toString() ?? null,
        unknownReason: impact.unknownReason,
        nextSequence: impact.sequence.toString(),
        poolId: pool?.id ?? null,
        poolSequence: pool?.lastSequence.toString() ?? null,
        poolMovementCount: pool?.lastMovementCount.toString() ?? null,
        poolStockRevision: pool?.lastStockRevision ?? null,
        poolLatestEffectiveAt: pool?.latestEffectiveAt.toISOString() ?? null,
        observedMovementCount: movementCount,
      },
    }
  })
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    supplierId: source.supplier.id,
    supplierName: source.supplier.name,
    supplierCode: source.supplier.code,
    storeId: source.store.id,
    storeName: source.store.name,
    description: input.description.trim(),
    reference: input.reference?.trim() || null,
    incurredAt: input.incurredAt.toISOString(),
    dueAt: input.dueAt?.toISOString() ?? null,
    totalMinor: source.totalMinor.toString(),
    payableIncreaseMinor: source.totalMinor.toString(),
    journal: [
      {
        accountId: source.inventory.id,
        accountName: source.inventory.name,
        code: source.inventory.code,
        debitMinor: source.totalMinor.toString(),
        creditMinor: "0",
      },
      {
        accountId: source.payable.id,
        accountName: source.payable.name,
        code: source.payable.code,
        debitMinor: "0",
        creditMinor: source.totalMinor.toString(),
      },
    ],
    goods,
    stockEffect: "RECEIPT" as const,
    valuationMode: "ORIGINAL_PURCHASE_COST" as const,
    moneyTransfer: "NOT_PERFORMED" as const,
    paymentEffect: "NONE" as const,
    receiptCorrection: "SUPPLIER_RETURN_SOURCE_REQUIRED" as const,
  }
}
export function financePurchaseRecordingReviewDigest(
  review: Awaited<ReturnType<typeof composeFinancePurchaseRecordingReview>>,
) {
  return createHash("sha256").update(JSON.stringify(review)).digest("hex")
}
export async function getFinancePurchaseRecordingReview(
  tx: Prisma.TransactionClient,
  input: FinancePurchaseReviewInput,
) {
  normalizeFinancePurchase({ ...input, clientCommandId: "review" })
  await assertFinanceManager(tx, input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const source = await resolveFinancePurchaseRecordingSource(tx, input, book),
    stock = await previewPurchaseStockReceipts(
      tx,
      financePurchaseStockInput(input),
    )
  return composeFinancePurchaseRecordingReview(tx, input, book, source, stock)
}
/** Internal fresh source preparation; callers own the Book lock. */
export async function prepareFinancePurchaseRecordingStock(
  tx: Prisma.TransactionClient,
  input: FinancePurchaseReviewInput,
) {
  return preparePurchaseStockReceiptsInTransaction(
    tx,
    financePurchaseStockInput(input),
  )
}
