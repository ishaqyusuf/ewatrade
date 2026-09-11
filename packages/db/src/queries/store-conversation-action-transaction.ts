import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { CUSTOMER_ACTION_TRANSACTION_OPTIONS } from "./service-commerce-actions/shared"
import { StoreConversationError } from "./store-conversations-core"

function objectProperty(value: unknown, property: string) {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, property)
    : undefined
}

export function isRetryableStoreConversationActionTransactionError(
  error: unknown,
) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === "P2002" || error.code === "P2034") return true
  if (error.code !== "P2010") return false

  const metadataCode = objectProperty(error.meta, "code")
  const driverError = objectProperty(error.meta, "driverAdapterError")
  const driverCause = objectProperty(driverError, "cause")
  const driverCauseKind = objectProperty(driverCause, "kind")
  return (
    metadataCode === "40001" ||
    driverCauseKind === "TransactionWriteConflict" ||
    error.message.includes("Code: `40001`")
  )
}

export async function runStoreConversationActionTransaction<Result>(
  db: PrismaClient,
  execute: (tx: Prisma.TransactionClient) => Promise<Result>,
) {
  try {
    return await db.$transaction(execute, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
  } catch (error) {
    if (!isRetryableStoreConversationActionTransactionError(error)) throw error
    try {
      return await db.$transaction(execute, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
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
