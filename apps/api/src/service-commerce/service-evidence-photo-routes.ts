import {
  CatalogError,
  RetailOpsSubscriptionError,
  assertAttachmentEntitlement,
  markServiceEvidencePhotoUploaded,
  readServiceEvidenceFile,
} from "@ewatrade/db/queries"
import { PrivateObjectStorageError } from "@ewatrade/private-media/object-storage"
import {
  SERVICE_EVIDENCE_PHOTO_MAX_BYTES,
  acceptsServiceEvidencePhotoBytes,
  createServiceEvidenceStorage,
} from "@ewatrade/private-media/service-evidence"
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
import { assertServiceOperator } from "../trpc/routers/service-permissions"

const evidenceIdSchema = z.string().min(1).max(64)

function refuse(
  context: Context,
  status: number,
  code: string,
  message: string,
) {
  context.header("Cache-Control", "private, no-store")
  return context.json({ code, error: message }, status as 400)
}

/** The same team members who can work on Service jobs; never public. */
async function admit(context: Context) {
  const ctx = await resolveProtectedTenantContext(
    await createTRPCContext(undefined, context),
  )
  assertServiceOperator(ctx.tenantContext.membership.role)
  return {
    db: ctx.db,
    actorUserId: ctx.session.user.id,
    tenantId: ctx.tenantContext.tenant.id,
    dataClassification: ctx.tenantContext.tenant.dataClassification,
  }
}

function target(row: Awaited<ReturnType<typeof readServiceEvidenceFile>>) {
  return {
    contentDigest: row.contentDigest,
    contentType: row.contentType,
    evidenceId: row.id,
    jobId: row.serviceJobId,
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
  if (error instanceof RetailOpsSubscriptionError)
    return refuse(context, 403, "PLAN_UPGRADE_REQUIRED", error.message)
  if (error instanceof QaProviderPolicyError)
    return refuse(
      context,
      412,
      "UPLOADS_UNAVAILABLE",
      "Photo uploads are unavailable for this business.",
    )
  if (
    error instanceof PrivateObjectStorageError &&
    error.code === "INTEGRITY_MISMATCH"
  )
    return refuse(
      context,
      400,
      "UPLOAD_REFUSED",
      "The photo must match the upload you started.",
    )
  if (error instanceof PrivateObjectStorageError)
    return refuse(
      context,
      503,
      "STORAGE_UNAVAILABLE",
      "Photos can't be saved right now. Try again in a moment.",
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

export function registerServiceEvidencePhotoRoutes(
  app: Pick<OpenAPIHono, "get" | "put">,
) {
  app.put("/api/services/evidence/:evidenceId/upload", async (context) => {
    context.header("Cache-Control", "private, no-store")
    try {
      const evidenceId = evidenceIdSchema.safeParse(
        context.req.param("evidenceId"),
      )
      if (!evidenceId.success)
        return refuse(context, 400, "BAD_REQUEST", "Invalid photo.")
      const { db, actorUserId, tenantId, dataClassification } =
        await admit(context)
      const row = await readServiceEvidenceFile(db, {
        evidenceId: evidenceId.data,
        tenantId,
      })
      // A replay after a successful upload returns the current state.
      if (row.uploadStatus === "AVAILABLE") {
        void context.req.raw.body?.cancel().catch(() => undefined)
        return context.json({ evidenceId: row.id, status: row.uploadStatus })
      }
      if (row.uploadStatus === "REVOKED")
        return refuse(context, 409, "UPLOAD_REFUSED", "This photo was removed.")
      await assertAttachmentEntitlement(db, { tenantId })
      const bytes = await readVerifiedUpload(context.req.raw, row, {
        maxBytes: SERVICE_EVIDENCE_PHOTO_MAX_BYTES,
        accepts: acceptsServiceEvidencePhotoBytes,
      })
      const storage = createServiceEvidenceStorage(dataClassification)
      const { storagePath } = await storage.stage({
        target: target(row),
        bytes,
        abortSignal: context.req.raw.signal,
      })
      await markServiceEvidencePhotoUploaded(db, {
        actorUserId,
        evidenceId: row.id,
        storagePath,
        storageProvider: storage.provider,
        storageStoreId: storage.storeId,
        tenantId,
      })
      return context.json({ evidenceId: row.id, status: "AVAILABLE" })
    } catch (error) {
      return mapError(context, error)
    }
  })

  /** Team members' view of a job photo; never public or cached. */
  app.get("/api/services/evidence/:evidenceId/content", async (context) => {
    try {
      const evidenceId = evidenceIdSchema.safeParse(
        context.req.param("evidenceId"),
      )
      if (!evidenceId.success)
        return refuse(context, 400, "BAD_REQUEST", "Invalid photo.")
      const { db, tenantId, dataClassification } = await admit(context)
      const row = await readServiceEvidenceFile(db, {
        evidenceId: evidenceId.data,
        tenantId,
      })
      if (row.uploadStatus !== "AVAILABLE" || !row.storagePath)
        return refuse(
          context,
          404,
          "NOT_READY",
          "This photo is still uploading.",
        )
      const bytes = await createServiceEvidenceStorage(dataClassification).read(
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
