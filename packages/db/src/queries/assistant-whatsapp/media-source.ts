import { createHash } from "node:crypto"

/** Original verified provider event, never the worker attempt or current selection. */
export function assistantWhatsAppMediaClientRequestId(
  phoneNumberId: string,
  providerMessageId: string,
  mediaId: string,
) {
  return `whatsapp-media:${createHash("sha256")
    .update(JSON.stringify([phoneNumberId, providerMessageId, mediaId]))
    .digest("hex")}`
}
