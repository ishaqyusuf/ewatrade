import type { Prisma } from "../../../generated/prisma/client"
import type {
  FinanceAccountKind,
  FinanceAccountPurpose,
} from "../../../generated/prisma/enums"
import { FinanceError } from "./rules"

export async function getPurchaseControlAccount(
  tx: Prisma.TransactionClient,
  bookId: string,
  code: string,
  kind: FinanceAccountKind,
  purpose: FinanceAccountPurpose,
) {
  const account = await tx.financeAccount.findUnique({
    where: { bookId_code: { bookId, code } },
  })
  if (
    !account ||
    account.archivedAt ||
    account.kind !== kind ||
    account.purpose !== purpose
  ) {
    throw new FinanceError(
      "CONFLICT",
      `Purchase control account ${code} is unavailable or has changed.`,
    )
  }
  return account
}

export function purchaseJournalEntryId(result: unknown) {
  if (
    !result ||
    typeof result !== "object" ||
    !("entryId" in result) ||
    typeof result.entryId !== "string"
  ) {
    throw new FinanceError(
      "CONFLICT",
      "The purchase journal cannot be recovered.",
    )
  }
  return result.entryId
}

export function requirePurchaseDate(effectiveAt: Date) {
  if (!Number.isFinite(effectiveAt.getTime())) {
    throw new FinanceError("INVALID_JOURNAL", "Enter a valid purchase date.")
  }
}
