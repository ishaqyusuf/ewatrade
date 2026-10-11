import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager } from "./access"
import type { RegisterFinancePurchaseInput } from "./purchase-recognition"
import {
  normalizePurchaseRegistration,
  resolvePurchaseRegistrationSource,
} from "./purchase-registration-source"
import { FinanceError } from "./rules"

/** Advisory agreement review; execution repeats source checks under the Book lock. */
export async function getFinancePurchaseRegistrationReview(
  tx: Prisma.TransactionClient,
  input: Omit<RegisterFinancePurchaseInput, "clientCommandId">,
) {
  await assertFinanceManager(tx, input)
  const { description, lines, totalMinor } =
    normalizePurchaseRegistration(input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const { supplier, store, inventory } =
    await resolvePurchaseRegistrationSource(tx, input, book, lines)
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierCode: supplier.code,
    storeId: store.id,
    inventoryAccountId: inventory.id,
    description,
    agreedAt: input.agreedAt.toISOString(),
    totalMinor: totalMinor.toString(),
    lines: lines.map((line) => ({
      balanceSourceId: line.balanceSourceId,
      enteredInventoryUnitId: line.enteredInventoryUnitId,
      configurationVersionId: line.expectedConfigurationVersionId,
      description: line.description,
      amountMinor: line.amount.toString(),
      enteredQuantity: line.enteredQuantity,
      categories: line.categories,
    })),
    effect: "AGREEMENT_ONLY_NO_PAYABLE_OR_STOCK" as const,
  }
}
