import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import { type FinanceActor, lockFinanceBook } from "./access"
import { FinanceError, financePayloadHash } from "./rules"

export type FinanceDocumentResult = { id: string }

export async function financeDocumentCommand(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string; clientCommandId: string },
  kind: string,
  payload: unknown,
  execute: (book: FinanceBook) => Promise<FinanceDocumentResult>,
): Promise<FinanceDocumentResult> {
  if (!input.clientCommandId.trim() || input.clientCommandId.length > 128) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A stable command identity is required.",
    )
  }
  const book = await lockFinanceBook(tx, input)
  const payloadHash = financePayloadHash(payload)
  const previous = await tx.financeCommand.findUnique({
    where: {
      bookId_clientCommandId: {
        bookId: book.id,
        clientCommandId: input.clientCommandId,
      },
    },
  })
  if (previous) {
    if (previous.kind !== kind || previous.payloadHash !== payloadHash) {
      throw new FinanceError(
        "CONFLICT",
        "This command was already used with different details.",
      )
    }
    const result = previous.result
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      typeof result.id !== "string"
    ) {
      throw new FinanceError(
        "CONFLICT",
        "The saved command result cannot be recovered.",
      )
    }
    return { id: result.id }
  }
  const result = await execute(book)
  await tx.financeCommand.create({
    data: {
      bookId: book.id,
      clientCommandId: input.clientCommandId,
      kind,
      payloadHash,
      actorUserId: input.actorUserId,
      result,
    },
  })
  return result
}

export function financePostingCommandId(clientCommandId: string, part: string) {
  return financePayloadHash({ clientCommandId, part })
}
