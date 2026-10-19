import { parseWhatsAppLinkMessage } from "@ewatrade/assistant/channels/whatsapp"
import {
  type NormalizedWhatsAppEvent,
  type NormalizedWhatsAppStatusEvent,
  assistantWhatsAppPilotUserIds,
  isPlatformWhatsAppNumber,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  type WhatsAppInboxReceipt,
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  claimAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  nextAssistantWhatsAppOutbox,
} from "@ewatrade/db/assistant-whatsapp"

import {
  enqueueAssistantWhatsAppDelivery,
  enqueueAssistantWhatsAppTurn,
} from "@ewatrade/jobs/assistant-whatsapp"

type PlatformDependencies = {
  receipt?: (event: NormalizedWhatsAppStatusEvent) => Promise<unknown>
  env: Record<string, string | undefined>
  accept: (
    input: unknown,
    permittedUserIds: readonly string[],
  ) => Promise<WhatsAppInboxReceipt>
  enqueue: (ingressId: string) => Promise<unknown>
  enqueueDelivery?: (outboxId: string) => Promise<unknown>
  claim: (input: {
    code: string
    phoneNumberId: string
    senderId: string
    messageId: string
  }) => Promise<boolean>
  disconnect: (input: {
    phoneNumberId: string
    senderId: string
  }) => Promise<unknown>
}

/** Called only after signature verification. Platform traffic never enters customer routing. */
export async function processPlatformWhatsAppEvent(
  event: NormalizedWhatsAppEvent,
  dependencies: PlatformDependencies = {
    env: process.env,
    receipt: async (event) => {
      const recorded = await acceptAssistantWhatsAppStatus(prisma, event)
      if (
        recorded &&
        process.env.ASSISTANT_WHATSAPP_ENABLED === "true" &&
        ["SENT", "DELIVERED", "READ", "FAILED"].includes(recorded.state)
      ) {
        const next = await nextAssistantWhatsAppOutbox(
          prisma,
          recorded.outboxId,
        )
        if (next && next.id !== recorded.outboxId) {
          try {
            await enqueueAssistantWhatsAppDelivery(next.id)
          } catch {
            console.error("[assistant] reply dispatch deferred to recovery")
          }
        }
      }
    },
    enqueue: enqueueAssistantWhatsAppTurn,
    enqueueDelivery: enqueueAssistantWhatsAppDelivery,
    accept: (input, permittedUserIds) =>
      acceptAssistantWhatsAppIngress(prisma, input, permittedUserIds),
    claim: (input) => claimAssistantWhatsAppLink(prisma, input),
    disconnect: (input) => disconnectAssistantWhatsApp(prisma, input),
  },
) {
  if (!isPlatformWhatsAppNumber(event.phoneNumberId, dependencies.env))
    return false
  // Persist only positively correlated assistant attempts, including while delivery is disabled.
  // Unmatched OTP status ownership stays reserved and never falls through to Tenant routing.
  if (event.kind === "status") {
    await dependencies.receipt?.(event)
    return true
  }
  if (
    /^(?:disconnect(?: ewatrade)?|stop|unsubscribe)$/i.test(
      event.text?.trim() ?? "",
    )
  ) {
    await dependencies.disconnect({
      phoneNumberId: event.phoneNumberId,
      senderId: event.externalCustomerId,
    })
    return true
  }
  const config = readAssistantWhatsAppConfig(dependencies.env)
  if (!config) return true
  const code = parseWhatsAppLinkMessage(event.text)
  if (code) {
    await dependencies.claim({
      code,
      phoneNumberId: event.phoneNumberId,
      senderId: event.externalCustomerId,
      messageId: event.messageId,
    })
    return true
  }
  // A six-digit amount is valid business input only for a fresh linked pilot binding; it never proves identity.
  const receipt = await dependencies.accept(
    {
      phoneNumberId: event.phoneNumberId,
      senderId: event.externalCustomerId,
      providerMessageId: event.messageId,
      timestamp: event.timestamp,
      type: event.type,
      text: event.text,
      quickActionId: event.quickActionId,
      replyToMessageId: event.replyToMessageId,
      media: event.media,
    },
    assistantWhatsAppPilotUserIds(dependencies.env),
  )
  if (receipt.kind === "quota_notice_accepted") {
    try {
      await dependencies.enqueueDelivery?.(receipt.outboxId)
    } catch {
      console.error("[assistant] reply dispatch deferred to recovery")
    }
  } else if (receipt.kind !== "ignored") {
    try {
      await dependencies.enqueue(receipt.id)
    } catch {
      console.error("[assistant] inbox dispatch deferred to recovery")
    }
  }
  // Durable inbox survives dispatch failure; no model/provider work occurs on the webhook.
  return true
}
