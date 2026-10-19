import { createHash } from "node:crypto"
import {
  type AssistantPrivateExportAttachmentTarget,
  AssistantPrivateExportError,
  readAssistantPrivateExport,
  validateAssistantPrivateExportSnapshot,
} from "@ewatrade/db/assistant-private-export"
import {
  assistantAttachmentStoragePath,
  resolveAssistantAttachmentStorage,
} from "@ewatrade/private-media/assistant-attachments"
import { PrivateObjectStorageError } from "@ewatrade/private-media/object-storage"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import type { Context } from "hono"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "../assistant/attachment-storage"
import { createTRPCContext } from "../trpc/init"
import { requireFreshAssistantExportSession } from "./assistant-export-session"

const maximumArchiveBytes = 24 * 1024 * 1024
const supportUrl = "https://ewatrade.com/support"

async function readOriginal(
  row: AssistantPrivateExportAttachmentTarget,
  signal: AbortSignal,
) {
  const config = resolveAssistantAttachmentStorage(row.dataClassification)
  const target = setupAttachmentTarget(row)
  if (
    row.storageProvider !== config.provider ||
    row.storageStoreId !== config.storeId ||
    row.storagePath !== assistantAttachmentStoragePath(target)
  )
    throw new PrivateObjectStorageError("INVALID_OBJECT")
  return setupAttachmentStorage(row.dataClassification).read({
    target,
    abortSignal: signal,
  })
}

/** Test seams replace storage/HTTP boundaries; account and snapshot checks remain real. */
export type AssistantPrivateExportDependencies = {
  context: typeof createTRPCContext
  read: typeof readAssistantPrivateExport
  validate: typeof validateAssistantPrivateExportSnapshot
  readOriginal: typeof readOriginal
}
const defaults: AssistantPrivateExportDependencies = {
  context: createTRPCContext,
  read: readAssistantPrivateExport,
  validate: validateAssistantPrivateExportSnapshot,
  readOriginal,
}

/** Fresh server-only adapter set; callers cannot mutate the registered defaults. */
export function defaultAssistantPrivateExportDependencies() {
  return { ...defaults }
}

function refuse(context: Context, status: number, code: string, error: string) {
  return context.json({ code, error, supportUrl }, status as 400)
}

/** Immediate own-account download: no artifact, public URL, model tool or merchant role. */
export async function assistantPrivateExportResponse(
  context: Context,
  deps = defaults,
) {
  context.header("Cache-Control", "private, no-store")
  context.header("X-Content-Type-Options", "nosniff")
  try {
    const ctx = await deps.context(undefined, context)
    const userId = await requireFreshAssistantExportSession(ctx)
    const snapshot = await deps.read(ctx.db, userId)
    const originals: Array<
      | {
          attachmentId: string
          availability: "available"
          encoding: "base64"
          content: string
        }
      | { attachmentId: string; availability: "unavailable"; reason: string }
    > = []
    let archiveBytes = Buffer.byteLength(JSON.stringify(snapshot.manifest))
    for (const target of snapshot.attachments) {
      if (context.req.raw.signal.aborted)
        throw new AssistantPrivateExportError("UNAVAILABLE")
      await requireFreshAssistantExportSession(ctx)
      if (target.retentionUntil.getTime() <= Date.now())
        throw new AssistantPrivateExportError("SCOPE_CHANGED")
      let bytes: Uint8Array
      try {
        bytes = await deps.readOriginal(target, context.req.raw.signal)
      } catch (error) {
        if (
          error instanceof PrivateObjectStorageError &&
          error.code === "OBJECT_NOT_FOUND"
        ) {
          originals.push({
            attachmentId: target.id,
            availability: "unavailable",
            reason: "The original object is no longer retained.",
          })
          continue
        }
        throw error
      }
      if (
        bytes.byteLength !== target.sizeBytes ||
        createHash("sha256").update(bytes).digest("hex") !==
          target.contentDigest
      )
        throw new PrivateObjectStorageError("INTEGRITY_MISMATCH")
      archiveBytes += Math.ceil(bytes.byteLength / 3) * 4 + 256
      if (archiveBytes > maximumArchiveBytes)
        throw new AssistantPrivateExportError("EXPORT_LIMIT")
      originals.push({
        attachmentId: target.id,
        availability: "available",
        encoding: "base64",
        content: Buffer.from(bytes).toString("base64"),
      })
    }
    // Recheck private-source revisions, retention, deletion and the persisted Session
    // after storage I/O. Nothing has been sent to the client yet.
    await deps.validate(ctx.db, userId, snapshot.snapshotDigest)
    await requireFreshAssistantExportSession(ctx)
    if (context.req.raw.signal.aborted)
      throw new AssistantPrivateExportError("UNAVAILABLE")
    const body = JSON.stringify({ ...snapshot.manifest, originals })
    if (Buffer.byteLength(body) > maximumArchiveBytes)
      throw new AssistantPrivateExportError("EXPORT_LIMIT")
    return context.body(body, 200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="ewatrade-assistant-data.json"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    })
  } catch (error) {
    if (error instanceof TRPCError)
      return refuse(
        context,
        error.code === "UNAUTHORIZED" ? 401 : 403,
        error.code,
        error.code === "UNAUTHORIZED"
          ? "Sign in again before downloading your assistant data."
          : "Use your own account. Assistant data cannot be downloaded while deletion is processing.",
      )
    if (error instanceof AssistantPrivateExportError) {
      const status =
        error.code === "EXPORT_LIMIT"
          ? 413
          : error.code === "SCOPE_CHANGED"
            ? 409
            : error.code === "UNAVAILABLE"
              ? 503
              : 403
      return refuse(
        context,
        status,
        error.code,
        error.code === "EXPORT_LIMIT"
          ? "This account needs a larger assisted export. Contact EwaTrade support; no partial download was created."
          : error.code === "SCOPE_CHANGED"
            ? "Your assistant data changed while preparing the download. Try again."
            : error.code === "SHARED_SCOPE_REVIEW_REQUIRED"
              ? "Shared assistant data needs a privacy review. Contact EwaTrade support."
              : "Assistant data is unavailable. Try again or contact EwaTrade support.",
      )
    }
    return refuse(
      context,
      503,
      "EXPORT_UNAVAILABLE",
      "Assistant data could not be downloaded. Try again or contact EwaTrade support.",
    )
  }
}

export function registerAssistantPrivateExportRoute(
  app: Pick<OpenAPIHono, "get">,
) {
  app.get("/api/assistant/private-export", (context) =>
    assistantPrivateExportResponse(context),
  )
}
