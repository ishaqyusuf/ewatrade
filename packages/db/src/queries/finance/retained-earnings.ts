import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"

export const FINANCE_RETAINED_EARNINGS_ACCOUNT = {
  code: "3200",
  name: "Retained earnings",
  kind: "EQUITY",
  purpose: "RETAINED_EARNINGS",
} as const

/** Internal provisioning only: caller must hold the authorized Book lock. */
export async function ensureFinanceRetainedEarningsAccount(
  tx: Prisma.TransactionClient,
  bookId: string,
) {
  const controls = await tx.financeAccount.findMany({
    where: { bookId, purpose: "RETAINED_EARNINGS" },
    take: 2,
  })
  if (controls.length > 1)
    throw new FinanceError(
      "CONFLICT",
      "Resolve duplicate retained-earnings controls before fiscal setup.",
    )
  const control = controls[0]
  if (control) {
    if (control.kind !== "EQUITY" || control.archivedAt !== null)
      throw new FinanceError(
        "CONFLICT",
        "Restore the original equity retained-earnings control before fiscal setup.",
      )
    return control
  }
  const occupied = await tx.financeAccount.findUnique({
    where: {
      bookId_code: { bookId, code: FINANCE_RETAINED_EARNINGS_ACCOUNT.code },
    },
  })
  if (occupied)
    throw new FinanceError(
      "CONFLICT",
      "Account code 3200 is already in use. Resolve it before fiscal setup.",
    )
  return tx.financeAccount.create({
    data: { bookId, ...FINANCE_RETAINED_EARNINGS_ACCOUNT },
  })
}
