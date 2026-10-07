import type { CatalogPhotoContentType } from "@ewatrade/catalog/photo-contracts"
import { processCatalogPhoto } from "@ewatrade/catalog/photo-processing"
import { createVercelCatalogPhotoStorage } from "@ewatrade/catalog/photo-storage"
import { uploadCatalogPhoto } from "@ewatrade/catalog/photo-upload"
import type { AssistantScope } from "@ewatrade/db/assistant"
import { readSentAssistantAttachment } from "@ewatrade/db/assistant-attachments"
import { ASSISTANT_ATTACHMENT_RETENTION_EXPIRED } from "@ewatrade/db/assistant-operations"
import {
  createCatalogPhotoIntent,
  getCatalogPhotoUploadTarget,
  recordVerifiedCatalogPhotoUpload,
} from "@ewatrade/db/catalog-photos"
import type { TRPCContext } from "../trpc/init"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "./attachment-storage"

export const SETUP_PHOTO_NOT_ADDED = "PHOTO_NOT_ADDED"

type Db = TRPCContext["db"]

/**
 * Moves a product photo the owner sent in the setup chat into the ordinary
 * Catalog photo pipeline (intent → verified upload → pending review), so it
 * is attached inside the Item creation transaction like any uploaded photo.
 * Catalog photos are live-only, so QA businesses add the product without it.
 */
export async function prepareSetupProductPhoto(
  db: Db,
  scope: AssistantScope & { dataClassification: "LIVE" | "QA" },
  input: { entityId: string; conversationId: string; attachmentId: string },
): Promise<{ assetId: string } | { skipped: typeof SETUP_PHOTO_NOT_ADDED }> {
  if (scope.dataClassification !== "LIVE")
    return { skipped: SETUP_PHOTO_NOT_ADDED }
  try {
    const attachment = await readSentAssistantAttachment(db, {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      conversationId: input.conversationId,
      attachmentId: input.attachmentId,
    })
    // Retention may already have deleted the bytes; never open a Catalog
    // upload for a photo that can no longer be read.
    if (
      !attachment ||
      attachment.kind !== "IMAGE" ||
      !attachment.storagePath ||
      attachment.errorCode === ASSISTANT_ATTACHMENT_RETENTION_EXPIRED
    )
      return { skipped: SETUP_PHOTO_NOT_ADDED }
    const actor = {
      actorUserId: scope.userId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    }
    const contentType = attachment.contentType as CatalogPhotoContentType
    const intent = await createCatalogPhotoIntent(db, {
      ...actor,
      // One photo per draft record; replays reuse the same asset.
      clientOperationId: `setup-photo-${input.entityId}`,
      contentDigest: attachment.contentDigest,
      contentType,
      sizeBytes: attachment.sizeBytes,
    })
    if (intent.state !== "UPLOADING") return { assetId: intent.assetId }
    const bytes = await setupAttachmentStorage("LIVE").read({
      target: setupAttachmentTarget(attachment),
    })
    const target = await getCatalogPhotoUploadTarget(db, {
      ...actor,
      assetId: intent.assetId,
    })
    await uploadCatalogPhoto({
      request: new Request("https://setup-assistant.invalid/photo", {
        method: "PUT",
        body: Uint8Array.from(bytes),
        headers: {
          "content-type": contentType,
          "content-length": String(bytes.byteLength),
        },
      }),
      target,
      storage: createVercelCatalogPhotoStorage(),
      validate: async (photo) => {
        await processCatalogPhoto(photo)
      },
      complete: (photo) => recordVerifiedCatalogPhotoUpload(db, actor, photo),
    })
    return { assetId: intent.assetId }
  } catch (error) {
    // The product is still added; the owner can add a photo in Catalog.
    console.error("[setup-commit] product photo not added", {
      entityId: input.entityId,
      name: error instanceof Error ? error.name : "unknown",
    })
    return { skipped: SETUP_PHOTO_NOT_ADDED }
  }
}
