import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { isPrismaTransactionWriteConflict } from "../utils/prisma-transaction-conflict"
import { isOwnSerializationConflict } from "./own-transaction"
import { CUSTOMER_ACTION_TRANSACTION_OPTIONS } from "./service-commerce-actions/shared"
import { StoreConversationError } from "./store-conversations-core"

/**
 * Serialization conflicts arrive as P2034, as P2010 with code 40001, or, when
 * the adapter rejects the commit itself, as a raw DriverAdapterError.
 */
export function isRetryableStoreConversationActionTransactionError(
  error: unknown,
) {
  if (isPrismaTransactionWriteConflict(error)) return true
  if (isOwnSerializationConflict(error)) return true
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

export async function runStoreConversationActionTransaction<Result>(
  db: PrismaClient,
  execute: (tx: Prisma.TransactionClient) => Promise<Result>,
) {
  try {
    return await db.$transaction(execute, {
      ...CUSTOMER_ACTION_TRANSACTION_OPTIONS,
    })
  } catch (error) {
    if (!isRetryableStoreConversationActionTransactionError(error)) throw error
    try {
      return await db.$transaction(execute, {
        ...CUSTOMER_ACTION_TRANSACTION_OPTIONS,
      })
    } catch (retryError) {
      if (isRetryableStoreConversationActionTransactionError(retryError)) {
        throw new StoreConversationError(
          "CONFLICT",
          "This conversation changed. Refresh the chat and try again.",
        )
      }
      throw retryError
    }
  }
}
