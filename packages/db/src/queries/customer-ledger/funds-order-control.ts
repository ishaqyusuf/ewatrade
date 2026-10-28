import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "../finance/rules"

/** Same canonical holding account as direct collections on an unbilled Order. */
export async function getUnbilledOrderFundsControl(
  tx: Prisma.TransactionClient,
  bookId: string,
) {
  const control =
    (await tx.financeAccount.findUnique({
      where: { bookId_code: { bookId, code: "2200" } },
    })) ??
    (await tx.financeAccount.create({
      data: {
        bookId,
        code: "2200",
        name: "Order collections awaiting reconciliation",
        kind: "LIABILITY",
        purpose: "OTHER",
      },
    }))
  if (
    control.archivedAt ||
    control.kind !== "LIABILITY" ||
    control.purpose !== "OTHER" ||
    control.name !== "Order collections awaiting reconciliation"
  )
    throw new FinanceError(
      "CONFLICT",
      "The Order collections account requires reconciliation.",
    )
  return control
}
