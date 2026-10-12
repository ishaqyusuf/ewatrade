import { normalizeStockCategoryName } from "@ewatrade/utils/inventory-categories"
import type { Prisma } from "../../../generated/prisma/client"
import {
  previewOrdinaryStockReceipt,
  previewPurchaseStockReceipts,
} from "../inventory-operations"
import type { PurchaseRecognitionInput } from "./purchase-recognition-preparation"
import { purchaseRecognitionCategories } from "./purchase-recognition-receipt-source"
import { purchaseRecognitionReviewSource } from "./purchase-recognition-review"
import { FinanceError } from "./rules"
import { addQuantities } from "./valuation-math"
import { calculatePurchaseReceiptValuation } from "./valuation-receipt-impact"

/** Advisory whole-agreement physical receipt. It never creates categories, stock or value. */
export async function getFinancePurchaseReceiptReview(
  tx: Prisma.TransactionClient,
  input: PurchaseRecognitionInput & { stage: "RECEIPT" },
) {
  if (input.stage !== "RECEIPT")
    throw new FinanceError("CONFLICT", "Choose a physical purchase receipt.")
  const { review, document } = await purchaseRecognitionReviewSource(tx, input)
  const stock = await previewPurchaseStockReceipts(tx, {
    tenantId: input.tenantId,
    storeId: review.storeId,
    lines: document.lines.map((line) => ({
      balanceSourceId: line.balanceSourceId,
      enteredInventoryUnitId: line.enteredInventoryUnitId,
      enteredQuantity: line.enteredQuantity.toFixed(),
      expectedConfigurationVersionId: line.configurationVersionId,
    })),
  })
  return composePurchaseReceiptReview(
    tx,
    input,
    { review, document },
    async (_, line) => {
      const preview = stock.get(line.balanceSourceId)
      if (!preview)
        throw new FinanceError(
          "CONFLICT",
          "The original receipt stock source is unavailable.",
        )
      return preview
    },
  )
}

/** Internal composer; public review and locked confirmation load their own source. */
export async function composePurchaseReceiptReview(
  tx: Prisma.TransactionClient,
  input: PurchaseRecognitionInput & { stage: "RECEIPT" },
  source: Awaited<
    ReturnType<typeof purchaseRecognitionReviewSource<"RECEIPT">>
  >,
  previewStock: typeof previewOrdinaryStockReceipt = previewOrdinaryStockReceipt,
) {
  const { review, document } = source
  const ids = document.lines.map((line) => line.balanceSourceId)
  if (new Set(ids).size !== ids.length)
    throw new FinanceError(
      "CONFLICT",
      "The original receipt stock sources are not distinct.",
    )
  const pools = await tx.financeInventoryPool.findMany({
    where: {
      bookId: review.bookId,
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
  const selectors = document.lines.flatMap((line) =>
    purchaseRecognitionCategories(line.categories),
  )
  const categoryIds = selectors.flatMap((s) =>
    "categoryNameId" in s ? [s.categoryNameId] : [],
  )
  const categoryNames = selectors.flatMap((s) =>
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
      "The receipt source exceeds its complete review bounds.",
    )
  const confirmations = input.receipts
  if (
    confirmations !== undefined &&
    (!Array.isArray(confirmations) ||
      confirmations.length !== document.lines.length ||
      new Set(confirmations.map((r) => r.lineId)).size !== confirmations.length)
  )
    throw new FinanceError(
      "CONFLICT",
      "Confirm every original goods line exactly once.",
    )
  const goods = []
  for (const line of [...document.lines].sort(
    (a, b) => a.costBillLine.position - b.costBillLine.position,
  )) {
    const stock = await previewStock(tx, {
      tenantId: input.tenantId,
      storeId: review.storeId,
      balanceSourceId: line.balanceSourceId,
      enteredInventoryUnitId: line.enteredInventoryUnitId,
      enteredQuantity: line.enteredQuantity.toFixed(),
    })
    if (
      stock.configurationVersionId !== line.configurationVersionId ||
      stock.currencyCode !== review.currencyCode ||
      !Number.isInteger(stock.revision) ||
      stock.revision < 0 ||
      stock.revision >= 2147483647
    )
      throw new FinanceError(
        "CONFLICT",
        "Refresh the original receipt's stock configuration and revision.",
      )
    const confirmation = confirmations?.find((r) => r.lineId === line.id)
    if (
      confirmations !== undefined &&
      (!confirmation || confirmation.expectedBalanceRevision !== stock.revision)
    )
      throw new FinanceError(
        "CONFLICT",
        "The receipt's reviewed stock revision changed.",
      )
    const movementCount =
      movements.find((m) => m.balanceSourceId === line.balanceSourceId)?._count
        ._all ?? 0
    const pool =
      pools.find((p) => p.balanceSourceId === line.balanceSourceId) ?? null
    const impact = calculatePurchaseReceiptValuation({
      quantityBefore: stock.canonicalBefore,
      canonicalEffect: stock.canonicalQuantity,
      quantityAfter: addQuantities(
        stock.canonicalBefore,
        stock.canonicalQuantity,
      ),
      sourceCostMinor: line.costBillLine.amountMinor,
      effectiveAt: input.effectiveAt,
      movementCount: movementCount + 1,
      pool,
    })
    const categories = new Map<
      string,
      { categoryNameId: number | null; name: string; willCreate: boolean }
    >()
    for (const selector of purchaseRecognitionCategories(line.categories)) {
      const category =
        "categoryNameId" in selector
          ? categoryRows.find((c) => c.id === selector.categoryNameId)
          : categoryRows.find(
              (c) =>
                c.normalizedName ===
                normalizeStockCategoryName(selector.name).normalizedName,
            )
      if ("categoryNameId" in selector && !category)
        throw new FinanceError(
          "CONFLICT",
          "The original receipt category is unavailable in this business.",
        )
      const name =
        category?.name ??
        ("name" in selector
          ? normalizeStockCategoryName(selector.name).name
          : "")
      categories.set(category ? `id:${category.id}` : `name:${name}`, {
        categoryNameId: category?.id ?? null,
        name,
        willCreate: !category,
      })
    }
    goods.push({
      lineId: line.id,
      description: line.costBillLine.description,
      amountMinor: line.costBillLine.amountMinor.toString(),
      enteredInventoryUnitId: line.enteredInventoryUnitId,
      enteredQuantity: line.enteredQuantity.toFixed(),
      enteredUnitName: stock.enteredUnitName,
      balanceSourceId: line.balanceSourceId,
      configurationVersionId: line.configurationVersionId,
      stock,
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
    })
  }
  return {
    ...review,
    goods,
    stockEffect: "RECEIPT" as const,
    receipts: goods.map((g) => ({
      lineId: g.lineId,
      expectedBalanceRevision: g.stock.revision,
    })),
    valuationMode: "ORIGINAL_ALLOCATED_COST" as const,
    receiptCorrection: "SUPPLIER_RETURN_SOURCE_REQUIRED" as const,
  }
}
