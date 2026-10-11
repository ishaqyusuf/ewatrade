import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"

export async function assertFinanceSupplierCodeAvailable(
  tx: Prisma.TransactionClient,
  bookId: string,
  code: string,
) {
  const existing = await tx.financeSupplierAccount.findUnique({
    where: { bookId_code: { bookId, code } },
    select: { id: true },
  })
  if (existing)
    throw new FinanceError("CONFLICT", "That supplier code is already in use.")
}
