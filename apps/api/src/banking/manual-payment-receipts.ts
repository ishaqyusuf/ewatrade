import { prisma } from "@ewatrade/db/client"
import {
  assertAttachmentEntitlement,
  readManualPaymentReport,
} from "@ewatrade/db/queries"
import {
  acceptsOrderAttachmentBytes,
  createOrderAttachmentStorage,
} from "@ewatrade/private-media/order-attachments"
import {
  VerifiedUploadError,
  readVerifiedUpload,
} from "@ewatrade/private-media/verified-upload"
import {
  MANUAL_RECEIPT_MAX_BYTES,
  ManualPaymentError,
} from "@ewatrade/utils/manual-payments"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import { orderScope } from "../trpc/order-scope"
import { assertCanOperateOrders } from "../trpc/routers/orders"
import { manualReportIdentity } from "./manual-payment-tokens"

export function registerManualPaymentReceiptRoutes(
  app: Pick<OpenAPIHono, "get" | "put">,
) {
  app.put("/api/manual-payments/reports/:reportId/receipt", async (c) => {
    c.header("Cache-Control", "private, no-store")
    try {
      const authorization = c.req.header("authorization") ?? ""
      if (!authorization.startsWith("Bearer "))
        return c.json({ error: "Payment report access required." }, 401)
      const proof = manualReportIdentity(authorization.slice(7))
      if (proof.reportId !== c.req.param("reportId"))
        return c.json({ error: "Report not found." }, 404)
      const row = await prisma.manualPaymentReport.findFirst({
        where: { id: proof.reportId, link: { tenant: { isActive: true } } },
        include: {
          link: {
            include: { tenant: { select: { dataClassification: true } } },
          },
        },
      })
      if (
        !row ||
        !row.receiptDigest ||
        !row.receiptContentType ||
        !row.receiptSizeBytes
      )
        return c.json({ error: "Receipt upload not found." }, 404)
      if (row.receiptUploadedAt) {
        void c.req.raw.body?.cancel().catch(() => undefined)
        return c.json({ status: "ready" })
      }
      if (
        row.status !== "DRAFT" ||
        row.createdAt.getTime() + 3600_000 <= Date.now() ||
        row.link.closedAt ||
        row.link.expiresAt <= new Date()
      )
        return c.json({ error: "Receipt upload expired." }, 410)
      await assertAttachmentEntitlement(prisma, { tenantId: row.link.tenantId })
      const metadata = {
        sizeBytes: row.receiptSizeBytes,
        contentDigest: row.receiptDigest,
        contentType: row.receiptContentType,
      }
      const bytes = await readVerifiedUpload(c.req.raw, metadata, {
        maxBytes: MANUAL_RECEIPT_MAX_BYTES,
        accepts: acceptsOrderAttachmentBytes,
      })
      const storage = createOrderAttachmentStorage(
        row.link.tenant.dataClassification,
      )
      const target = {
        tenantId: row.link.tenantId,
        orderId: row.link.orderId,
        attachmentId: row.id,
        ...metadata,
      }
      const saved = await storage.stage({
        target,
        bytes,
        abortSignal: c.req.raw.signal,
      })
      const changed = await prisma.manualPaymentReport.updateMany({
        where: {
          id: row.id,
          status: "DRAFT",
          receiptDigest: row.receiptDigest,
          receiptUploadedAt: null,
          link: {
            closedAt: null,
            expiresAt: { gt: new Date() },
            tenant: { isActive: true },
          },
        },
        data: {
          receiptStoragePath: saved.storagePath,
          receiptProvider: storage.provider,
          receiptStoreId: storage.storeId,
          receiptUploadedAt: new Date(),
        },
      })
      if (!changed.count)
        return c.json(
          { error: "The payment report changed. Refresh before submitting." },
          409,
        )
      return c.json({ status: "ready" })
    } catch (error) {
      void c.req.raw.body?.cancel().catch(() => undefined)
      if (error instanceof VerifiedUploadError)
        return c.json({ error: error.message }, error.status)
      if (error instanceof TRPCError)
        return c.json({ error: error.message }, 401)
      return c.json(
        {
          error:
            "The receipt could not be saved. Try uploading this receipt again.",
        },
        400,
      )
    }
  })
  app.get("/api/manual-payments/reports/:reportId/receipt", async (c) => {
    c.header("Cache-Control", "private, no-store")
    try {
      const ctx = await resolveProtectedTenantContext(
        await createTRPCContext(undefined, c),
      )
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const row = await readManualPaymentReport(ctx.db, {
        reportId: c.req.param("reportId"),
        scope: await orderScope(ctx),
      })
      if (
        !row.receiptUploadedAt ||
        !row.receiptStoragePath ||
        !row.receiptContentType ||
        !row.receiptDigest ||
        !row.receiptSizeBytes
      )
        return c.json({ error: "Receipt not found." }, 404)
      const bytes = await createOrderAttachmentStorage(
        row.link.tenant.dataClassification,
      ).read({
        target: {
          tenantId: row.link.tenantId,
          orderId: row.link.orderId,
          attachmentId: row.id,
          contentType: row.receiptContentType,
          contentDigest: row.receiptDigest,
          sizeBytes: row.receiptSizeBytes,
        },
        abortSignal: c.req.raw.signal,
      })
      return new Response(Uint8Array.from(bytes), {
        headers: {
          "Content-Type": row.receiptContentType,
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": "inline",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      })
    } catch (error) {
      if (error instanceof ManualPaymentError)
        return c.json(
          { error: error.message },
          error.code === "NOT_FOUND" ? 404 : 403,
        )
      if (error instanceof TRPCError)
        return c.json(
          { error: "Sign in with permission to review this payment." },
          403,
        )
      return c.json({ error: "Receipt unavailable." }, 404)
    }
  })
}
