import {
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  WhatsAppProviderSendError,
} from "./whatsapp"
import {
  normalizeWhatsAppOtpRecipient,
  readWhatsAppOtpConfig,
} from "./whatsapp-otp"

export type StaffInviteWhatsAppConfig = {
  accessToken: string
  phoneNumberId: string
  templateName: string
  language: string
}

/**
 * Sent from the platform sign-in number, so the attendant's invite and their
 * WhatsApp sign-in code arrive in the same chat. Off until the approved
 * template and its language are set and WhatsApp sign-in itself is on.
 */
export function readStaffInviteWhatsAppConfig(
  env: Record<string, string | undefined> = process.env,
): StaffInviteWhatsAppConfig | null {
  const templateName = env.STAFF_INVITE_WHATSAPP_TEMPLATE_NAME?.trim()
  const language = env.STAFF_INVITE_WHATSAPP_TEMPLATE_LANGUAGE?.trim()
  if (!templateName && !language) return null
  if (
    !templateName ||
    !/^[a-z0-9_]{1,512}$/.test(templateName) ||
    !language ||
    !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)
  )
    throw new Error("Staff invite WhatsApp template configuration is invalid.")
  const sender = readWhatsAppOtpConfig(env)
  if (!sender) return null
  return {
    accessToken: sender.accessToken,
    phoneNumberId: sender.phoneNumberId,
    templateName,
    language,
  }
}

/**
 * Template contract (utility category):
 *   body: "{{1}} invited you to join as a {{2}} on ẸwáTrade. Tap Accept invite,
 *          then sign in with this WhatsApp number."
 *   URL button "Accept invite": <dashboard>/staff-onboarding?inviteToken={{1}}
 * No retries here: a network failure may come after Meta accepted the message.
 */
export function createStaffInviteWhatsAppSender(
  config: StaffInviteWhatsAppConfig,
  provider: Pick<
    WhatsAppProvider,
    "sendTemplate"
  > = new DirectMetaWhatsAppProvider(),
) {
  return async (input: {
    businessName: string
    inviteToken: string
    phone: string
    roleLabel: string
  }) => {
    if (!/^[A-Za-z0-9_-]{20,256}$/.test(input.inviteToken))
      throw new Error("A staff invite token is required.")
    const to = normalizeWhatsAppOtpRecipient(input.phone)
    const text = (value: string) =>
      value
        .replace(/[\r\n\t]+/g, " ")
        .replace(/ {4,}/g, " ")
        .trim()
        .slice(0, 120)
    try {
      return await provider.sendTemplate({
        accessToken: config.accessToken,
        phoneNumberId: config.phoneNumberId,
        templateName: config.templateName,
        language: config.language,
        to,
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: text(input.businessName) || "A business" },
              { type: "text", text: text(input.roleLabel) },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: input.inviteToken }],
          },
        ],
      })
    } catch (error) {
      if (error instanceof WhatsAppProviderSendError) throw error
      // Never surface provider exceptions that may carry tokens or credentials.
      throw new WhatsAppProviderSendError(
        "PROVIDER_RESULT_INVALID",
        "OUTCOME_UNKNOWN",
      )
    }
  }
}
