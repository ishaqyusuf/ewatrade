import { FinanceError } from "@ewatrade/db/finance-expense-receipt-delivery"
import { ExpenseReceiptDownloadTokenError } from "@ewatrade/private-media/expense-receipt-download-token"
import { ExpenseReceiptStorageError } from "@ewatrade/private-media/expense-receipts"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import type { Context } from "hono"
import { financeExpenseReceiptAssetSchema } from "../schemas/finance-expense-receipts"
import {
  type ExpenseReceiptDeliveryContext,
  ExpenseReceiptDeliveryError,
  downloadFinanceExpenseReceiptOriginal,
  issueFinanceExpenseReceiptDownload,
} from "./expense-receipt-delivery-workflow"

type ReceiptSource = { bookId: string; billId: string; assetId: string }
export type PrepareExpenseReceiptDelivery = (
  context: Context,
  source: ReceiptSource,
) => Promise<
  Pick<
    ExpenseReceiptDeliveryContext,
    "repository" | "sessionId" | "checkSession"
  >
>

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie, Authorization, X-App-Authorization, X-Receipt-Download-Token",
}

function errorResponse(error: unknown) {
  let status = 500
  let message =
    "Private receipt access is unavailable. Request a new download grant."
  if (error instanceof ExpenseReceiptDeliveryError) {
    status = error.status
    message = error.message
  } else if (error instanceof ExpenseReceiptDownloadTokenError) {
    status = error.code === "DOWNLOAD_NOT_CONFIGURED" ? 503 : 403
    message = error.message
  } else if (error instanceof QaProviderPolicyError) {
    status = 412
    message = error.message
  } else if (error instanceof ExpenseReceiptStorageError) {
    status =
      error.code === "RECEIPT_NOT_FOUND"
        ? 404
        : error.code === "RECEIPT_SCOPE_MISMATCH"
          ? 403
          : 503
    message = error.message
  } else if (error instanceof FinanceError) {
    status =
      error.code === "FORBIDDEN"
        ? 403
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "CONFLICT" || error.code === "CLOSED_PERIOD"
            ? 409
            : 400
    message = error.message
  } else if (error instanceof TRPCError) {
    status = getHTTPStatusCodeFromError(error)
    message = error.message
  }
  return Response.json({ error: message }, { status, headers: privateHeaders })
}

function source(context: Context): ReceiptSource | null {
  const query = new URL(context.req.url).searchParams
  if (
    [...query.keys()].some((key) => key !== "bookId" && key !== "billId") ||
    query.getAll("bookId").length !== 1 ||
    query.getAll("billId").length !== 1 ||
    context.req.raw.body !== null ||
    context.req.header("range") !== undefined
  )
    return null
  const result = financeExpenseReceiptAssetSchema.safeParse({
    bookId: query.get("bookId"),
    billId: query.get("billId"),
    assetId: context.req.param("assetId"),
  })
  return result.success ? result.data : null
}

/** All adapters are required trusted server wiring; no request selects a provider or session. */
export function registerFinanceExpenseReceiptDeliveryRoutes(
  app: OpenAPIHono,
  adapters: {
    prepare: PrepareExpenseReceiptDelivery
    secret: () => unknown
    storage: ExpenseReceiptDeliveryContext["storage"]
  },
) {
  const handler =
    (action: "issue" | "download") => async (context: Context) => {
      try {
        const selected = source(context)
        if (!selected) {
          if (context.req.raw.body && !context.req.raw.body.locked)
            void context.req.raw.body.cancel().catch(() => undefined)
          return Response.json(
            { error: "Invalid private receipt access details." },
            { status: 400, headers: privateHeaders },
          )
        }
        const authenticated = await adapters.prepare(context, selected)
        const input: ExpenseReceiptDeliveryContext = {
          ...authenticated,
          secret: adapters.secret(),
          storage: adapters.storage,
          signal: context.req.raw.signal,
        }
        if (action === "issue")
          return Response.json(
            await issueFinanceExpenseReceiptDownload(input),
            { headers: privateHeaders },
          )
        const original = await downloadFinanceExpenseReceiptOriginal({
          ...input,
          token: context.req.header("x-receipt-download-token"),
        })
        return new Response(Buffer.from(original.bytes), {
          headers: {
            ...privateHeaders,
            "Content-Type": original.contentType,
            "Content-Length": String(original.bytes.length),
            "Content-Disposition": `attachment; filename="${original.fileName}"`,
            "Content-Security-Policy": "default-src 'none'; sandbox",
          },
        })
      } catch (error) {
        return errorResponse(error)
      }
    }
  app.post(
    "/api/finance/expense-receipts/:assetId/download-grant",
    handler("issue"),
  )
  app.get(
    "/api/finance/expense-receipts/:assetId/original",
    handler("download"),
  )
}
