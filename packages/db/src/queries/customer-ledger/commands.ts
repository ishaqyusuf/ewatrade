import type { Prisma } from "../../../generated/prisma/client"
import { type FinanceActor, lockFinanceBook } from "../finance/access"
import { FinanceError, financePayloadHash } from "../finance/rules"
import { lockCustomerLedgerAccount } from "./accounts"

type CustomerCommandInput = FinanceActor & {
  bookId: string
  accountId: string
  clientCommandId: string
}

/** Stable Tenant-wide command identity, recovered before reviewed-state checks. */
export async function customerLedgerDocumentCommand(
  tx: Prisma.TransactionClient,
  input: CustomerCommandInput,
  kind: string,
  payload: unknown,
  execute: (
    book: Awaited<ReturnType<typeof lockFinanceBook>>,
    account: Awaited<ReturnType<typeof lockCustomerLedgerAccount>>,
  ) => Promise<{ id: string; audit?: Prisma.InputJsonObject }>,
) {
  if (!input.clientCommandId.trim() || input.clientCommandId.length > 128)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A stable customer command is required.",
    )
  const book = await lockFinanceBook(tx, input)
  const account = await lockCustomerLedgerAccount(tx, input)
  if (book.currencyCode !== account.currencyCode)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Customer account and book currency must match.",
    )
  const payloadHash = financePayloadHash(payload)
  const previous = await tx.customerLedgerCommand.findUnique({
    where: {
      tenantId_clientCommandId: {
        tenantId: input.tenantId,
        clientCommandId: input.clientCommandId,
      },
    },
  })
  if (previous) {
    if (
      previous.accountId !== account.id ||
      previous.kind !== kind ||
      previous.payloadHash !== payloadHash
    )
      throw new FinanceError(
        "CONFLICT",
        "This customer command was used with different details.",
      )
    const result = previous.result
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      typeof result.id !== "string"
    )
      throw new FinanceError(
        "CONFLICT",
        "The saved customer result cannot be recovered.",
      )
    return { id: result.id }
  }
  const result = await execute(book, account)
  await tx.customerLedgerCommand.create({
    data: {
      tenantId: input.tenantId,
      accountId: account.id,
      clientCommandId: input.clientCommandId,
      kind,
      payloadHash,
      actorUserId: input.actorUserId,
      result,
    },
  })
  return { id: result.id }
}
