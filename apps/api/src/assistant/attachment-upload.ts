import { SETUP_ATTACHMENT_LIMITS } from "@ewatrade/assistant/setup/attachments"
import {
  AssistantAttachmentError,
  markAssistantAttachmentUploaded,
  readAssistantAttachment,
} from "@ewatrade/db/assistant-attachments"
import { enqueueAssistantAttachmentProcessing } from "@ewatrade/jobs/assistant-attachments"
import { acceptsAssistantAttachmentBytes } from "@ewatrade/private-media/assistant-attachments"
import { PrivateObjectStorageError } from "@ewatrade/private-media/object-storage"
import {
  VerifiedUploadError,
  readVerifiedUpload,
} from "@ewatrade/private-media/verified-upload"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import type { Context } from "hono"
import { parseBuffer } from "music-metadata"
import { z } from "zod"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "./attachment-storage"
import {
  SETUP_MEDIA_DISABLED,
  isAssistantVoiceEnabled,
  isSetupAssistantMediaEnabled,
  requireSetupAssistantScope,
} from "./setup-context"

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
  return { db: ctx.db, scope: requireSetupAssistantScope(ctx) }
}

function mapError(context: Context, error: unknown) {
  if (context.req.raw.body && !context.req.raw.body.locked)
    void context.req.raw.body.cancel().catch(() => undefined)
  if (error instanceof VerifiedUploadError)
    return refuse(context, error.status, "UPLOAD_REFUSED", error.message)
  if (error instanceof AssistantAttachmentError)
    return refuse(context, 404, error.code, error.message)
  if (error instanceof QaProviderPolicyError)
    return refuse(
      context,
      412,
      "UPLOADS_UNAVAILABLE",
      "File uploads are unavailable for this business.",
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

export function registerAssistantAttachmentRoutes(
  app: Pick<OpenAPIHono, "get" | "put">,
) {
  app.put(
    "/api/assistant/attachments/:attachmentId/upload",
    async (context) => {
      context.header("Cache-Control", "private, no-store")
      try {
        const attachmentId = attachmentIdSchema.safeParse(
          context.req.param("attachmentId"),
        )
        if (!attachmentId.success)
          return refuse(context, 400, "BAD_REQUEST", "Invalid file.")
        const { db, scope } = await admit(context)
        const row = await readAssistantAttachment(db, scope, attachmentId.data)
        if (
          !(row.kind === "AUDIO"
            ? isAssistantVoiceEnabled()
            : isSetupAssistantMediaEnabled())
        ) {
          void context.req.raw.body?.cancel().catch(() => undefined)
          return refuse(
            context,
            412,
            SETUP_MEDIA_DISABLED.code,
            SETUP_MEDIA_DISABLED.message,
          )
        }
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
        const bytes = await readVerifiedUpload(context.req.raw, row, {
          maxBytes: SETUP_ATTACHMENT_LIMITS[row.kind].maxBytes,
          accepts: acceptsAssistantAttachmentBytes,
        })
        let durationMs: number | undefined
        if (row.kind === "AUDIO") {
          try {
            const metadata = await parseBuffer(
              bytes,
              { mimeType: row.contentType, size: bytes.length },
              { duration: true, skipCovers: true },
            )
            const seconds = metadata.format.duration
            if (!seconds || !Number.isFinite(seconds) || seconds > 120)
              return refuse(
                context,
                400,
                "INVALID_AUDIO",
                "Record a voice note of up to two minutes.",
              )
            durationMs = Math.ceil(seconds * 1000)
          } catch {
            return refuse(
              context,
              400,
              "INVALID_AUDIO",
              "This recording could not be opened. Please record it again.",
            )
          }
        }
        const storage = setupAttachmentStorage(scope.dataClassification)
        const { storagePath } = await storage.stage({
          target: setupAttachmentTarget(row),
          bytes,
          abortSignal: context.req.raw.signal,
        })
        const saved = await markAssistantAttachmentUploaded(db, {
          attachmentId: row.id,
          storageProvider: storage.provider,
          storageStoreId: storage.storeId,
          storagePath,
          durationMs,
        })
        if (!saved) {
          await storage
            .remove({ target: setupAttachmentTarget(row) })
            .catch(() => undefined)
          return refuse(
            context,
            409,
            "UPLOAD_EXPIRED",
            "This recording was removed or its upload expired.",
          )
        }
        // Stored and recorded: a dispatch failure is recovered by the sweep.
        await enqueueAssistantAttachmentProcessing(row.id).catch(
          () => undefined,
        )
        return context.json({ attachmentId: row.id, status: "UPLOADED" })
      } catch (error) {
        return mapError(context, error)
      }
    },
  )

  /** Owner preview of their own photo or voice note; never public or cached. */
  app.get(
    "/api/assistant/attachments/:attachmentId/content",
    async (context) => {
      try {
        const attachmentId = attachmentIdSchema.safeParse(
          context.req.param("attachmentId"),
        )
        if (!attachmentId.success)
          return refuse(context, 400, "BAD_REQUEST", "Invalid file.")
        const { db, scope } = await admit(context)
        const row = await readAssistantAttachment(db, scope, attachmentId.data)
        if (
          row.retentionUntil.getTime() <= Date.now() ||
          !row.storagePath ||
          !["IMAGE", "AUDIO"].includes(row.kind) ||
          ["image/heic", "image/heif"].includes(row.contentType)
        )
          return refuse(context, 404, "NO_PREVIEW", "No preview for this file.")
        const bytes = await setupAttachmentStorage(
          scope.dataClassification,
        ).read({ target: setupAttachmentTarget(row) })
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
    },
  )
}
