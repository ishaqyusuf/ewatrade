import {
  FinanceError,
  createFinanceExpenseReceiptUploadRepository,
} from "@ewatrade/db/finance-expense-receipt-upload"
import { ExpenseReceiptUploadError } from "@ewatrade/private-media/expense-receipt-upload"
import {
  type ExpenseReceiptContentType,
  ExpenseReceiptStorageError,
} from "@ewatrade/private-media/expense-receipts"
import { createVercelPrivateObjectPort } from "@ewatrade/private-media/vercel-blob"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import type { Context } from "hono"
import { financeExpenseReceiptAssetSchema } from "../schemas/finance-expense-receipts"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import { financeExpenseReceiptActorScope } from "./expense-receipt-session"
import { createFinanceExpenseReceiptSessionCheck } from "./expense-receipt-session-context"
import {
  type ExpenseReceiptUploadStorage,
  uploadFinanceExpenseReceipt,
  withFinanceExpenseReceiptUploadSession,
} from "./expense-receipt-upload-workflow"

export { financeExpenseReceiptActorScope } from "./expense-receipt-session"

function financeReceiptStorage(): ExpenseReceiptUploadStorage {
  // Explicit Finance configuration. No Catalog/default token or ambient OIDC fallback.
  return createVercelPrivateObjectPort<ExpenseReceiptContentType>({
    BLOB_STORE_ID: process.env.RECEIPT_BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: process.env.RECEIPT_BLOB_READ_WRITE_TOKEN,
  })
}

type Input = { bookId: string; billId: string; assetId: string }
type Repository = Parameters<
  typeof uploadFinanceExpenseReceipt
>[0]["repository"]

async function prepare(context: Context, input: Input): Promise<Repository> {
  const ctx = await resolveProtectedTenantContext(
    await createTRPCContext(undefined, context),
  )
  const actor = financeExpenseReceiptActorScope(ctx)
  const checkSession = createFinanceExpenseReceiptSessionCheck(context, ctx)
  const repository = createFinanceExpenseReceiptUploadRepository(ctx.db, {
    ...input,
    ...actor,
  })
  return withFinanceExpenseReceiptUploadSession(repository, checkSession)
}

/** Optional adapters are server/test-only; the production registration supplies no overrides. */
export function registerFinanceExpenseReceiptUploadRoutes(
  app: OpenAPIHono,
  adapters: {
    prepare?: typeof prepare
    storage?: () => ExpenseReceiptUploadStorage
  } = {},
) {
  app.put("/api/finance/expense-receipts/:assetId/upload", async (context) => {
    context.header("Cache-Control", "private, no-store")
    context.header("X-Content-Type-Options", "nosniff")
    try {
      const query = new URL(context.req.url).searchParams
      if (
        [...query.keys()].some((key) => key !== "bookId" && key !== "billId") ||
        query.getAll("bookId").length !== 1 ||
        query.getAll("billId").length !== 1
      )
        throw new ExpenseReceiptUploadError(
          400,
          "Invalid receipt upload details.",
        )
      const parsed = financeExpenseReceiptAssetSchema.safeParse({
        bookId: query.get("bookId"),
        billId: query.get("billId"),
        assetId: context.req.param("assetId"),
      })
      if (!parsed.success)
        throw new ExpenseReceiptUploadError(
          400,
          "Invalid receipt upload details.",
        )
      const repository = await (adapters.prepare ?? prepare)(
        context,
        parsed.data,
      )
      const result = await uploadFinanceExpenseReceipt({
        request: context.req.raw,
        repository,
        storage: adapters.storage ?? financeReceiptStorage,
      })
      return context.json(result, 200)
    } catch (error) {
      const body = context.req.raw.body
      if (body && !body.locked) void body.cancel().catch(() => undefined)
      if (error instanceof ExpenseReceiptUploadError)
        return context.json({ error: error.message }, error.status)
      if (error instanceof QaProviderPolicyError)
        return context.json({ error: error.message }, 412)
      if (error instanceof ExpenseReceiptStorageError)
        return context.json(
          { error: error.message },
          error.code === "INVALID_RECEIPT" ? 400 : 503,
        )
      if (error instanceof FinanceError)
        return context.json(
          { error: error.message },
          error.code === "FORBIDDEN"
            ? 403
            : error.code === "NOT_FOUND"
              ? 404
              : error.code === "CONFLICT" || error.code === "CLOSED_PERIOD"
                ? 409
                : 400,
        )
      if (error instanceof TRPCError)
        return Response.json(
          { error: error.message },
          {
            status: getHTTPStatusCodeFromError(error),
            headers: {
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        )
      return context.json(
        {
          error:
            "Receipt upload could not be completed. Retry the same original receipt.",
        },
        500,
      )
    }
  })
}
