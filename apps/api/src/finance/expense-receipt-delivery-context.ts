import { createFinanceExpenseReceiptDeliveryRepository } from "@ewatrade/db/finance-expense-receipt-delivery"
import type { ExpenseReceiptContentType } from "@ewatrade/private-media/expense-receipts"
import { createVercelPrivateObjectPort } from "@ewatrade/private-media/vercel-blob"
import { TRPCError } from "@trpc/server"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import type { PrepareExpenseReceiptDelivery } from "./expense-receipt-delivery"
import { financeExpenseReceiptActorScope } from "./expense-receipt-session"
import { createFinanceExpenseReceiptSessionCheck } from "./expense-receipt-session-context"

export function financeExpenseReceiptDeliveryStorage() {
  return createVercelPrivateObjectPort<ExpenseReceiptContentType>({
    BLOB_STORE_ID: process.env.RECEIPT_BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: process.env.RECEIPT_BLOB_READ_WRITE_TOKEN,
  })
}

/** Current context plus a fresh persisted session lookup; cached cookie facts cannot authorize bytes. */
export const prepareFinanceExpenseReceiptDelivery: PrepareExpenseReceiptDelivery =
  async (context, source) => {
    const ctx = await resolveProtectedTenantContext(
      await createTRPCContext(undefined, context),
    )
    const actor = financeExpenseReceiptActorScope(ctx)
    const session = ctx.session
    if (!session)
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be signed in to continue.",
      })
    const sessionId = session.session.id
    return {
      repository: createFinanceExpenseReceiptDeliveryRepository(ctx.db, {
        ...source,
        ...actor,
      }),
      sessionId,
      checkSession: createFinanceExpenseReceiptSessionCheck(context, ctx),
    }
  }
