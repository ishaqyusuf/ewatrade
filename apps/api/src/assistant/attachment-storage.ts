import {
  createAssistantAttachmentStorage,
  resolveAssistantAttachmentStorage,
} from "@ewatrade/private-media/assistant-attachments"

type AttachmentRow = {
  id: string
  tenantId: string
  conversationId: string
  contentDigest: string
  contentType: string
  sizeBytes: number
}

/** Storage for the business's data classification; QA never reaches Blob. */
export function setupAttachmentStorage(dataClassification: "LIVE" | "QA") {
  return createAssistantAttachmentStorage(
    resolveAssistantAttachmentStorage(dataClassification),
    dataClassification,
  )
}

export function setupAttachmentTarget(row: AttachmentRow) {
  return {
    tenantId: row.tenantId,
    conversationId: row.conversationId,
    attachmentId: row.id,
    contentDigest: row.contentDigest,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
  }
}

/** Whether uploads can be stored at all right now, without throwing. */
export function isSetupAttachmentStorageAvailable(
  dataClassification: "LIVE" | "QA",
) {
  try {
    setupAttachmentStorage(dataClassification).assertAvailable()
    return true
  } catch {
    return false
  }
}
