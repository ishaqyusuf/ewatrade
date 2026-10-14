import type { AccountPrivacyPrivateAttachment } from "@ewatrade/db/queries"
import {
  assistantAttachmentStoragePath,
  createAssistantAttachmentStorage,
  resolveAssistantAttachmentStorage,
} from "@ewatrade/private-media/assistant-attachments"
import { PrivateObjectStorageError } from "@ewatrade/private-media/object-storage"

/** Delete only the immutable canonical object in its recorded provider/store, then verify absence. */
export async function removeAccountPrivacyPrivateAttachment(
  row: AccountPrivacyPrivateAttachment,
) {
  const config = resolveAssistantAttachmentStorage(row.dataClassification)
  const target = {
    tenantId: row.tenantId,
    conversationId: row.conversationId,
    attachmentId: row.id,
    contentDigest: row.contentDigest,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
  }
  if (
    !row.storagePath ||
    row.storageProvider !== config.provider ||
    row.storageStoreId !== config.storeId ||
    row.storagePath !== assistantAttachmentStoragePath(target)
  )
    throw new PrivateObjectStorageError("INVALID_OBJECT")
  const storage = createAssistantAttachmentStorage(
    config,
    row.dataClassification,
  )
  await storage.remove({ target })
  try {
    await storage.read({ target })
  } catch (error) {
    if (
      error instanceof PrivateObjectStorageError &&
      error.code === "OBJECT_NOT_FOUND"
    )
      return
    throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
  }
  throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE")
}
