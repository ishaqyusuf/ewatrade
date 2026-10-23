import { createHash } from "node:crypto"
import { presentWhatsAppMessage } from "@ewatrade/assistant/channels/presentation"
import {
  DirectMetaWhatsAppProvider,
  type NormalizedWhatsAppMessageEvent,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import { runInOwnSerializableTransaction } from "@ewatrade/db/own-transaction"

/** Credential-shaped submissions only. Ordinary six-digit money remains ordinary input. */
export function isWhatsAppCredentialSubmission(text: string | undefined) {
  return (
    /\b(?:my\s+)?(?:password|passcode|api[ _-]?key|secret[ _-]?key|recovery[ _-]?code|verification[ _-]?code|otp)\s*(?::|=|is\b)\s*\S+/i.test(
      text ?? "",
    ) ||
    /(?:\bsk-(?:proj-)?[a-zA-Z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(
      text ?? "",
    )
  )
}
/** Store only delivery attribution, never the credential or its digest. No ambiguous resend. */
export async function sendWhatsAppCredentialNotice(
  event: NormalizedWhatsAppMessageEvent,
  config: { phoneNumberId: string; accessToken: string },
) {
  const id = `wa-receipt_sensitive_${createHash("sha256").update(`${event.phoneNumberId}:${event.externalCustomerId}:${event.messageId}`).digest("hex")}`
  const claimed = await runInOwnSerializableTransaction(prisma, async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`
    if (await tx.onboardingSession.findUnique({ where: { id } })) return false
    const identity = await tx.assistantWhatsAppIdentity.findUnique({
      where: {
        phoneNumberId_senderId: {
          phoneNumberId: event.phoneNumberId,
          senderId: event.externalCustomerId,
        },
      },
      select: { id: true, userId: true },
    })
    if (
      identity &&
      (await tx.assistantWhatsAppGrant.findFirst({
        where: {
          identityId: identity.id,
          tenant: { dataClassification: "QA" },
        },
        select: { id: true },
      }))
    )
      return false
    await tx.onboardingSession.create({
      data: {
        id,
        token: id,
        userId: identity?.userId,
        completed: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        formData: { kind: "whatsapp_sensitive_notice_v1" },
      },
    })
    return true
  })
  if (claimed)
    try {
      await new DirectMetaWhatsAppProvider().sendText({
        ...config,
        to: event.externalCustomerId,
        body: presentWhatsAppMessage(
          "Please don’t send passwords, API keys or private recovery codes here.\n\nFor CONNECT or REGISTER, enter only the email verification code when I explicitly request it.\n\nManage your password in EwaTrade account settings. This message was kept out of assistant history.",
          { family: "account" },
        ),
      })
    } catch {
      /* Acceptance may be unknown; don't duplicate the notice on webhook retry. */
    }
}
