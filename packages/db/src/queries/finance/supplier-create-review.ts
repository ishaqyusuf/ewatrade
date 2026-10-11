import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager } from "./access"
import { FinanceError } from "./rules"
import { assertFinanceSupplierCodeAvailable } from "./supplier-create-source"
import { normalizeFinanceSupplier } from "./supplier-rules"
import type { CreateFinanceSupplierInput } from "./supplier-writes"

/** Advisory only; the command repeats authority and uniqueness under its Book lock. */
export async function getFinanceSupplierCreationReview(
  tx: Prisma.TransactionClient,
  input: Omit<CreateFinanceSupplierInput, "clientCommandId">,
) {
  await assertFinanceManager(tx, input)
  const { code, name } = normalizeFinanceSupplier(input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
    select: { id: true, currencyCode: true },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  await assertFinanceSupplierCodeAvailable(tx, book.id, code)
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    code,
    name,
    payableMinor: "0",
    advanceMinor: "0",
    moneyTransfer: "NOT_PERFORMED" as const,
  }
}
