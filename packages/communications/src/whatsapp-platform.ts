import { assistantWhatsAppConfigurationValid } from "@ewatrade/assistant/channels/policy"

type Environment = Record<string, string | undefined>

/** Reserve the existing platform sender even while OTP/assistant delivery is off. */
export function isPlatformWhatsAppNumber(
  phoneNumberId: string,
  env: Environment = process.env,
) {
  const configured = env.WHATSAPP_OTP_PHONE_NUMBER_ID?.trim()
  return Boolean(
    configured && /^\d+$/.test(configured) && phoneNumberId === configured,
  )
}

/** Reuses the OTP provider identity, without coupling the two enable flags. */
export function readAssistantWhatsAppConfig(env: Environment = process.env) {
  if (env.ASSISTANT_WHATSAPP_ENABLED !== "true") return null
  const accessToken = env.WHATSAPP_OTP_ACCESS_TOKEN?.trim() ?? ""
  const phoneNumberId = env.WHATSAPP_OTP_PHONE_NUMBER_ID?.trim() ?? ""
  const displayNumber =
    env.ASSISTANT_WHATSAPP_DISPLAY_NUMBER?.trim().replace(/^\+/, "") ?? ""
  if (!assistantWhatsAppConfigurationValid(env))
    throw new Error(
      "Assistant WhatsApp configuration is incomplete or invalid.",
    )
  return { accessToken, phoneNumberId, displayNumber }
}

/** Empty means nobody is enrolled; public request input cannot add pilots. */
export function assistantWhatsAppPilotUserIds(env: Environment = process.env) {
  return [
    ...new Set(
      env.ASSISTANT_WHATSAPP_PILOT_USER_IDS?.split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id.length <= 128) ?? [],
    ),
  ]
}
export function isAssistantWhatsAppPilot(
  userId: string,
  env: Environment = process.env,
) {
  return Boolean(userId && assistantWhatsAppPilotUserIds(env).includes(userId))
}
