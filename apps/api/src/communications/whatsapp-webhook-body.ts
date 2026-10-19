export const WHATSAPP_WEBHOOK_MAX_BYTES = 1024 * 1024
export const WHATSAPP_WEBHOOK_MAX_EVENTS = 100

/** Bound raw bytes before JSON parsing. Signature verification still precedes dispatch. */
export async function readWhatsAppWebhookBody(request: Request) {
  const length = Number(request.headers.get("content-length"))
  if (Number.isFinite(length) && length > WHATSAPP_WEBHOOK_MAX_BYTES)
    return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let body = ""
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return body + decoder.decode()
      bytes += chunk.value.byteLength
      if (bytes > WHATSAPP_WEBHOOK_MAX_BYTES) {
        await reader.cancel()
        return null
      }
      body += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}
