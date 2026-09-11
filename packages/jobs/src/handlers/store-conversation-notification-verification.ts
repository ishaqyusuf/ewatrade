import { resolveCommunicationsRecipient } from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  claimStoreConversationNotificationVerification,
  completeStoreConversationNotificationVerification,
  failStoreConversationNotificationVerification,
} from "@ewatrade/db/queries"
import {
  type EmailTransport,
  createEmailMessage,
  createTestRoutedEmailMessages,
  getDefaultEmailTransport,
  renderStoreNotificationVerificationTemplate,
} from "@ewatrade/email"
import { deriveStoreConversationNotificationVerificationCode } from "@ewatrade/service-commerce/server"

export type StoreConversationNotificationVerificationPayload = {
  storeId: string
  tenantId: string
  verificationId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimStoreConversationNotificationVerification>>
>

type Dependencies = {
  claim(
    payload: StoreConversationNotificationVerificationPayload,
  ): Promise<Claim | null>
  complete(
    payload: StoreConversationNotificationVerificationPayload,
  ): Promise<unknown>
  emailTransport: EmailTransport
  fail(
    payload: StoreConversationNotificationVerificationPayload & {
      failureCode: string
      outcomeUnknown?: boolean
      terminal?: boolean
    },
  ): Promise<unknown>
  resolveRecipient(reference: string): string
}

function defaultDependencies(): Dependencies {
  return {
    claim: (payload) =>
      claimStoreConversationNotificationVerification(prisma, payload),
    complete: (payload) =>
      completeStoreConversationNotificationVerification(prisma, payload),
    emailTransport: getDefaultEmailTransport(),
    fail: (payload) =>
      failStoreConversationNotificationVerification(prisma, payload),
    resolveRecipient: resolveCommunicationsRecipient,
  }
}

export async function runStoreConversationNotificationVerification(
  payload: StoreConversationNotificationVerificationPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claim = await dependencies.claim(payload)
  if (!claim) return null
  if (claim.channel === "whatsapp") {
    await dependencies.fail({
      ...payload,
      failureCode: "whatsapp_verification_policy_unavailable",
      terminal: true,
    })
    return null
  }
  const recipient = dependencies.resolveRecipient(claim.destinationCiphertext)
  const code = deriveStoreConversationNotificationVerificationCode(
    claim.verificationId,
  )
  const content = renderStoreNotificationVerificationTemplate({ code })
  const message = createEmailMessage({
    from: process.env.EMAIL_FROM ?? "noreply@ewatrade.local",
    html: content.html,
    idempotencyKey: `store-conversation-notification-verification:${claim.verificationId}`,
    subject: "Verify Store notifications",
    text: content.text,
    to: recipient,
  })
  try {
    const routed = createTestRoutedEmailMessages(message)
    for (const email of routed) {
      await dependencies.emailTransport.send(email)
    }
    await dependencies.complete(payload)
    return { channel: "email" as const, sent: true }
  } catch {
    await dependencies.fail({
      ...payload,
      failureCode: "verification_email_outcome_unknown",
      outcomeUnknown: true,
    })
    return null
  }
}

export async function storeConversationNotificationVerificationHandler(
  payload: StoreConversationNotificationVerificationPayload,
) {
  await runStoreConversationNotificationVerification(payload)
}
