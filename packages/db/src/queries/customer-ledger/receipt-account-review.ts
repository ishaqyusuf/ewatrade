import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "../finance/rules"
import type { RecordCustomerLedgerReceiptInput } from "./receipts"

/** Shared read-only source checks; receipt execution still calls this after locks/replay. */
export async function reviewCustomerReceiptAccounts(
  tx: Prisma.TransactionClient,
  input: Pick<
    RecordCustomerLedgerReceiptInput,
    "tenantId" | "moneyAccountId" | "method" | "storeId"
  >,
  book: { id: string },
) {
  const money = await tx.financeAccount.findFirst({
    where: {
      id: input.moneyAccountId,
      bookId: book.id,
      kind: "ASSET",
      purpose: { in: ["CASH", "BANK", "CLEARING"] },
      archivedAt: null,
    },
  })
  if (!money)
    throw new FinanceError(
      "NOT_FOUND",
      "Choose an active money account in this financial book.",
    )
  if (
    (input.method === "CASH" && money.purpose !== "CASH") ||
    (input.method === "BANK_TRANSFER" && money.purpose !== "BANK") ||
    (["CARD", "POS"].includes(input.method) && money.purpose === "CASH")
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "The selected money account does not match the receipt method.",
    )
  const advances = await tx.financeAccount.findFirst({
    where: {
      bookId: book.id,
      purpose: "CUSTOMER_ADVANCE",
      kind: "LIABILITY",
      archivedAt: null,
    },
  })
  if (!advances)
    throw new FinanceError(
      "NOT_FOUND",
      "Customer advance account is unavailable.",
    )
  if (
    input.storeId &&
    !(await tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId },
      select: { id: true },
    }))
  )
    throw new FinanceError("NOT_FOUND", "Store not found in this business.")
  return { money, advances }
}
