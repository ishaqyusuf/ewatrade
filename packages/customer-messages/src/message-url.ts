import { normalizeWhatsAppPhone } from "./phone"

export const WHATSAPP_MESSAGE_MAX_CHARACTERS = 1_500
export const WHATSAPP_MESSAGE_URL_MAX_CHARACTERS = 8_000
export const WHATSAPP_MESSAGE_ORIGIN = "https://wa.me"

function characterCount(value: string): number {
  return Array.from(value).length
}

export function buildWhatsAppMessageUrl(
  phoneE164: string,
  text: string,
): string {
  const phone = normalizeWhatsAppPhone(phoneE164)
  if (!phone || phone.phoneE164 !== phoneE164) {
    throw new Error("A valid E.164 phone number is required")
  }
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("WhatsApp message text cannot be empty")
  }
  if (characterCount(text) > WHATSAPP_MESSAGE_MAX_CHARACTERS) {
    throw new Error(
      `WhatsApp message cannot exceed ${WHATSAPP_MESSAGE_MAX_CHARACTERS} characters`,
    )
  }

  const url = new URL(`/${phone.digits}`, WHATSAPP_MESSAGE_ORIGIN)
  url.search = `?text=${encodeURIComponent(text)}`
  const result = url.toString()
  if (url.origin !== WHATSAPP_MESSAGE_ORIGIN) {
    throw new Error("Unexpected WhatsApp message URL origin")
  }
  if (result.length > WHATSAPP_MESSAGE_URL_MAX_CHARACTERS) {
    throw new Error(
      `Encoded WhatsApp message URL cannot exceed ${WHATSAPP_MESSAGE_URL_MAX_CHARACTERS} characters`,
    )
  }
  return result
}
