import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { normalizeStockCategorySelectors } from "@ewatrade/utils/inventory-categories"
import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager } from "./access"
import type { RegisterFinancePurchaseInput } from "./purchase-recognition"
import { purchaseRecognitionText } from "./purchase-recognition-rules"
import {
  getPurchaseControlAccount,
  requirePurchaseDate,
} from "./purchase-source"
import {
  FinanceError,
  MAX_FINANCE_AMOUNT,
  assertFinancePostingDate,
  financeAmount,
} from "./rules"

type Input = Omit<RegisterFinancePurchaseInput, "clientCommandId">
export function normalizePurchaseRegistration(input: Input) {
  const description = purchaseRecognitionText(
    input.description,
    "purchase description",
    400,
  )
  requirePurchaseDate(input.agreedAt)
  if (
    !Array.isArray(input.lines) ||
    input.lines.length < 1 ||
    input.lines.length > 10 ||
    new Set(input.lines.map((line) => line.balanceSourceId)).size !==
      input.lines.length
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Enter 1–10 distinct purchase goods lines.",
    )
  }
  const lines = input.lines.map((line, position) => {
    if (!Array.isArray(line.categories) || !line.categories.length)
      throw new FinanceError("INVALID_JOURNAL", "Select receipt categories.")
    try {
      return {
        ...line,
        position,
        description: purchaseRecognitionText(
          line.description,
          "line description",
          200,
        ),
        amount: financeAmount(line.amountMinor),
        enteredQuantity: parseExactDecimal(line.enteredQuantity, {
          allowZero: false,
          maxScale: 18,
        }),
        categories: normalizeStockCategorySelectors(line.categories),
      }
    } catch (error) {
      if (error instanceof FinanceError) throw error
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Check the exact purchase quantity and categories.",
      )
    }
  })
  const totalMinor = lines.reduce((sum, line) => sum + line.amount, BigInt(0))
  if (totalMinor > MAX_FINANCE_AMOUNT)
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Purchase total exceeds the transaction limit.",
    )
  return { description, lines, totalMinor }
}
export async function resolvePurchaseRegistrationSource(
  tx: Prisma.TransactionClient,
  input: Input,
  book: FinanceBook,
  lines: ReturnType<typeof normalizePurchaseRegistration>["lines"],
) {
  const tenant = await assertFinanceManager(tx, input)
  assertFinancePostingDate({
    effectiveAt: input.agreedAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  if (tenant.currencyCode !== book.currencyCode)
    throw new FinanceError(
      "CONFLICT",
      "The financial book currency has changed.",
    )
  const [supplier, store] = await Promise.all([
    tx.financeSupplierAccount.findFirst({
      where: { id: input.supplierId, bookId: book.id },
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
  if (!supplier || !store)
    throw new FinanceError(
      "NOT_FOUND",
      "Choose a same-book supplier and same-currency business Store.",
    )
  const inventory = await getPurchaseControlAccount(
    tx,
    book.id,
    "1300",
    "ASSET",
    "INVENTORY",
  )
  for (const line of lines) {
    const balance = await tx.stockBalanceSource.findFirst({
      where: {
        id: line.balanceSourceId,
        tenantId: input.tenantId,
        storeId: store.id,
      },
      include: { inventoryUnit: true, product: true },
    })
    const unit = await tx.inventoryUnit.findUnique({
      where: { id: line.enteredInventoryUnitId },
    })
    if (
      !balance ||
      !unit ||
      unit.configurationVersionId !== line.expectedConfigurationVersionId ||
      unit.configurationVersionId !==
        balance.product.currentUnitConfigurationVersionId ||
      balance.inventoryUnit.configurationVersionId !==
        unit.configurationVersionId ||
      (balance.kind === "PACKAGED_STOCK" && unit.id !== balance.inventoryUnitId)
    )
      throw new FinanceError(
        "CONFLICT",
        "The purchase goods units or Store scope have changed.",
      )
    try {
      parseExactDecimal(line.enteredQuantity, {
        allowZero: false,
        maxScale: unit.transactionScale,
      })
    } catch {
      throw new FinanceError(
        "INVALID_JOURNAL",
        "The purchase quantity exceeds its unit precision.",
      )
    }
  }
  return { supplier, store, inventory }
}
