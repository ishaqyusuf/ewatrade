import {
  CatalogError,
  markCommercialOrderAttachmentUploaded,
  readCommercialOrderAttachment,
} from "@ewatrade/db/queries"
import { PrivateObjectStorageError } from "@ewatrade/private-media/object-storage"
import {
  ORDER_ATTACHMENT_MAX_BYTES,
  acceptsOrderAttachmentBytes,
  createOrderAttachmentStorage,
} from "@ewatrade/private-media/order-attachments"
import {
  createOrderVideoStorage,
  parseVideoRange,
} from "@ewatrade/private-media/order-videos"
import {
  VerifiedUploadError,
  readVerifiedUpload,
} from "@ewatrade/private-media/verified-upload"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import type { Context } from "hono"
import { z } from "zod"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import { orderScope } from "../trpc/order-scope"
import { assertCanOperateOrders } from "../trpc/routers/orders"

const attachmentIdSchema = z.string().min(1).max(64)

function refuse(
  context: Context,
  status: number,
  code: string,
  message: string,
) {
  context.header("Cache-Control", "private, no-store")
  return context.json({ code, error: message }, status as 400)
}

async function admit(context: Context) {
  const ctx = await resolveProtectedTenantContext(
    await createTRPCContext(undefined, context),
  )
  assertCanOperateOrders(ctx.tenantContext.membership.role)
  return {
    db: ctx.db,
    tenantId: ctx.tenantContext.tenant.id,
    dataClassification: ctx.tenantContext.tenant.dataClassification,
    scope: await orderScope(ctx),
  }
}

function target(row: {
  id: string
  tenantId: string
  orderId: string
  contentDigest: string
  contentType: string
  sizeBytes: number
}) {
  return {
    attachmentId: row.id,
    contentDigest: row.contentDigest,
    contentType: row.contentType,
    orderId: row.orderId,
    sizeBytes: row.sizeBytes,
    tenantId: row.tenantId,
  }
}

function mapError(context: Context, error: unknown) {
  if (context.req.raw.body && !context.req.raw.body.locked)
    void context.req.raw.body.cancel().catch(() => undefined)
  if (error instanceof VerifiedUploadError)
    return refuse(context, error.status, "UPLOAD_REFUSED", error.message)
  if (error instanceof CatalogError)
    return refuse(context, 404, error.code, error.message)
  if (error instanceof QaProviderPolicyError)
    return refuse(
      context,
      412,
      "UPLOADS_UNAVAILABLE",
      "File uploads are unavailable for this business.",
    )
  if (
    error instanceof PrivateObjectStorageError &&
    error.code === "INTEGRITY_MISMATCH"
  )
    return refuse(
      context,
      400,
      "UPLOAD_REFUSED",
      "The file must match the upload you started.",
    )
  if (error instanceof PrivateObjectStorageError)
    return refuse(
      context,
      503,
      "STORAGE_UNAVAILABLE",
      "Files can't be saved right now. Try again in a moment.",
    )
  if (error instanceof TRPCError)
    return refuse(
      context,
      getHTTPStatusCodeFromError(error),
      error.code,
      error.message,
    )
  throw error
}

export function registerOrderAttachmentRoutes(
  app: Pick<OpenAPIHono, "get" | "put">,
) {
  app.put("/api/orders/attachments/:attachmentId/upload", async (context) => {
    context.header("Cache-Control", "private, no-store")
    try {
      const attachmentId = attachmentIdSchema.safeParse(
        context.req.param("attachmentId"),
      )
      if (!attachmentId.success)
        return refuse(context, 400, "BAD_REQUEST", "Invalid file.")
      const { db, tenantId, dataClassification, scope } = await admit(context)
      const row = await readCommercialOrderAttachment(db, {
        attachmentId: attachmentId.data,
        scope,
        tenantId,
      })
      // A replay after a successful upload returns the current state.
      if (row.status !== "PENDING_UPLOAD") {
        void context.req.raw.body?.cancel().catch(() => undefined)
        return context.json({ attachmentId: row.id, status: row.status })
      }
      if (row.uploadExpiresAt.getTime() <= Date.now())
        return refuse(
          context,
          410,
          "UPLOAD_EXPIRED",
          "This upload expired. Attach the file again.",
        )
      if (row.kind === "VIDEO")
        return await uploadVideo(context, row, {
          db,
          tenantId,
          dataClassification,
        })
      const bytes = await readVerifiedUpload(context.req.raw, row, {
        maxBytes: ORDER_ATTACHMENT_MAX_BYTES,
        accepts: acceptsOrderAttachmentBytes,
      })
      const storage = createOrderAttachmentStorage(dataClassification)
      const { storagePath } = await storage.stage({
        target: target(row),
        bytes,
        abortSignal: context.req.raw.signal,
      })
      const saved = await markCommercialOrderAttachmentUploaded(db, {
        attachmentId: row.id,
        storagePath,
        storageProvider: storage.provider,
        storageStoreId: storage.storeId,
        tenantId,
      })
      if (!saved)
        return refuse(
          context,
          409,
          "UPLOAD_EXPIRED",
          "This upload expired. Attach the file again.",
        )
      return context.json({ attachmentId: row.id, status: "READY" })
    } catch (error) {
      return mapError(context, error)
    }
  })

  /** Team members' view of an order photo or PDF; never public or cached. */
  app.get("/api/orders/attachments/:attachmentId/content", async (context) => {
    try {
      const attachmentId = attachmentIdSchema.safeParse(
        context.req.param("attachmentId"),
      )
      if (!attachmentId.success)
        return refuse(context, 400, "BAD_REQUEST", "Invalid file.")
      const { db, tenantId, dataClassification, scope } = await admit(context)
      const row = await readCommercialOrderAttachment(db, {
        attachmentId: attachmentId.data,
        scope,
        tenantId,
      })
      if (row.status !== "READY" || !row.storagePath)
        return refuse(
          context,
          404,
          "NOT_READY",
          "This file is still uploading.",
        )
      if (row.kind === "VIDEO")
        return await streamVideo(context, row, dataClassification)
      const bytes = await createOrderAttachmentStorage(dataClassification).read(
        { target: target(row) },
      )
      return new Response(Uint8Array.from(bytes), {
        headers: {
          "Content-Type": row.contentType,
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": "inline",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      })
    } catch (error) {
      return mapError(context, error)
    }
  })
}

type AttachmentRow = Awaited<ReturnType<typeof readCommercialOrderAttachment>>

/**
 * QA videos stream through the API into the local test store. Live videos
 * upload straight to storage (orders.activity.uploadTarget), so they are
 * refused here: Vercel would cut the body off anyway.
 */
async function uploadVideo(
  context: Context,
  row: AttachmentRow,
  {
    db,
    tenantId,
    dataClassification,
  }: Pick<
    Awaited<ReturnType<typeof admit>>,
    "db" | "tenantId" | "dataClassification"
  >,
) {
  const storage = createOrderVideoStorage(dataClassification)
  const body = context.req.raw.body
  const length = context.req.header("content-length")
  if (storage.mode !== "api")
    return refuse(
      context,
      409,
      "UPLOAD_DIRECT",
      "Upload this video with the app's direct upload.",
    )
  if (
    !body ||
    context.req.header("content-type") !== row.contentType ||
    (length !== undefined && Number(length) !== row.sizeBytes)
  )
    return refuse(
      context,
      400,
      "UPLOAD_REFUSED",
      "The file must match the upload you started.",
    )
  const { storagePath } = await storage.write(
    target(row),
    body,
    context.req.raw.signal,
  )
  const saved = await markCommercialOrderAttachmentUploaded(db, {
    attachmentId: row.id,
    storagePath,
    storageProvider: storage.provider,
    storageStoreId: storage.storeId,
    tenantId,
  })
  if (!saved)
    return refuse(
      context,
      409,
      "UPLOAD_EXPIRED",
      "This upload expired. Attach the video again.",
    )
  return context.json({ attachmentId: row.id, status: "READY" })
}

/** Streams a video with Range support, so players can seek. */
async function streamVideo(
  context: Context,
  row: AttachmentRow,
  dataClassification: "LIVE" | "QA",
) {
  const range = parseVideoRange(
    context.req.header("range") ?? null,
    row.sizeBytes,
  )
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": row.contentType,
    "X-Content-Type-Options": "nosniff",
  }
  if (range === "unsatisfiable")
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${row.sizeBytes}` },
    })
  const video = await createOrderVideoStorage(dataClassification).open(
    target(row),
    range,
    context.req.raw.signal,
  )
  return new Response(video.body, {
    status: video.status,
    headers: {
      ...headers,
      "Content-Length": String(video.contentLength),
      ...(video.contentRange ? { "Content-Range": video.contentRange } : {}),
    },
  })
}
