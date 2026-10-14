import {
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  WhatsAppProviderSendError,
} from "./whatsapp"

export type WhatsAppOtpConfig = {
  accessToken: string
  phoneNumberId: string
  templateName: string
  language: string
}

/** Platform authentication uses its own sender, never a merchant Connection. */
export function readWhatsAppOtpConfig(
  env: Record<string, string | undefined> = process.env,
): WhatsAppOtpConfig | null {
  if (env.WHATSAPP_OTP_ENABLED !== "true") return null
  const accessToken = env.WHATSAPP_OTP_ACCESS_TOKEN?.trim()
  const phoneNumberId = env.WHATSAPP_OTP_PHONE_NUMBER_ID?.trim()
  const templateName = env.WHATSAPP_OTP_TEMPLATE_NAME?.trim()
  const language = env.WHATSAPP_OTP_TEMPLATE_LANGUAGE?.trim()
  if (
    !accessToken ||
    !phoneNumberId ||
    !/^\d+$/.test(phoneNumberId) ||
    !templateName ||
    !/^[a-z0-9_]{1,512}$/.test(templateName) ||
    !language ||
    !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)
  ) {
    throw new Error(
      "WhatsApp OTP sender configuration is incomplete or invalid.",
    )
  }
  return { accessToken, phoneNumberId, templateName, language }
}

export function normalizeWhatsAppOtpRecipient(phone: string): string {
  const normalized = phone.trim()
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("Use an international phone number with its country code.")
  }
  return normalized.slice(1)
}

/**
 * Delivery only: the caller owns verified identity binding, cryptographic code
 * generation, expiry, consumption and send/attempt rate limits. No retries here:
 * a network failure may occur after Meta has accepted the message.
 */
export function createWhatsAppOtpSender(
  config: WhatsAppOtpConfig,
  provider: Pick<
    WhatsAppProvider,
    "sendTemplate"
  > = new DirectMetaWhatsAppProvider(),
) {
  return async (input: { code: string; phone: string }) => {
    if (!/^\d{6}$/.test(input.code)) {
      throw new Error("A six-digit verification code is required.")
    }
    const to = normalizeWhatsAppOtpRecipient(input.phone)
    try {
      return await provider.sendTemplate({
        accessToken: config.accessToken,
        phoneNumberId: config.phoneNumberId,
        templateName: config.templateName,
        language: config.language,
        to,
        components: [
          { type: "body", parameters: [{ type: "text", text: input.code }] },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: input.code }],
          },
        ],
      })
    } catch (error) {
      if (error instanceof WhatsAppProviderSendError) throw error
      // Do not expose provider/network exceptions containing codes or credentials.
      throw new WhatsAppProviderSendError(
        "PROVIDER_RESULT_INVALID",
        "OUTCOME_UNKNOWN",
      )
    }
  }
}
