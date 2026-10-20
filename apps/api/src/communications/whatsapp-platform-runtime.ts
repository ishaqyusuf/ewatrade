import { parseWhatsAppLinkMessage } from "@ewatrade/assistant/channels/whatsapp"
import {
  type NormalizedWhatsAppEvent,
  type NormalizedWhatsAppMessageEvent,
  type NormalizedWhatsAppStatusEvent,
  assistantWhatsAppPilotUserIds,
  isPlatformWhatsAppNumber,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  AssistantWhatsAppError,
  type WhatsAppInboxReceipt,
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  autoConfirmAssistantWhatsAppLink,
  claimAssistantWhatsAppLink,
  disconnectAssistantWhatsApp,
  nextAssistantWhatsAppOutbox,
} from "@ewatrade/db/assistant-whatsapp"

import {
  enqueueAssistantWhatsAppDelivery,
  enqueueAssistantWhatsAppTurn,
} from "@ewatrade/jobs/assistant-whatsapp"

import {
  cancelWhatsAppOnboarding,
  processWhatsAppOnboardingMessage,
} from "./whatsapp-onboarding-runtime"

type PlatformDependencies = {
  receipt?: (event: NormalizedWhatsAppStatusEvent) => Promise<unknown>
  env: Record<string, string | undefined>
  accept: (
    input: unknown,
    permittedUserIds: readonly string[],
  ) => Promise<WhatsAppInboxReceipt>
  enqueue: (ingressId: string) => Promise<unknown>
  enqueueDelivery?: (outboxId: string) => Promise<unknown>
  onboarding?: (
    event: NormalizedWhatsAppMessageEvent,
    config: { phoneNumberId: string; accessToken: string },
  ) => Promise<{ handled: boolean }>
  cancelOnboarding?: (input: {
    phoneNumberId: string
    senderId: string
  }) => Promise<unknown>
  claim: (input: {
    code: string
    phoneNumberId: string
    senderId: string
    messageId: string
    providerOccurredAt?: Date
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
    onboarding: processWhatsAppOnboardingMessage,
    cancelOnboarding: cancelWhatsAppOnboarding,
    accept: (input, permittedUserIds) =>
      acceptAssistantWhatsAppIngress(prisma, input, permittedUserIds),
    claim: async (input) => {
      const claimed = await claimAssistantWhatsAppLink(prisma, input)
      try {
        const connected = await autoConfirmAssistantWhatsAppLink(prisma, input)
        if (connected?.welcomeOutboxId)
          try {
            await enqueueAssistantWhatsAppDelivery(connected.welcomeOutboxId)
          } catch {
            console.error("[assistant] connection welcome deferred to recovery")
          }
      } catch (error) {
        if (
          !(error instanceof AssistantWhatsAppError) ||
          !["UNAVAILABLE", "UNAUTHORIZED", "CONFLICT", "EXPIRED"].includes(
            error.code,
          )
        )
          throw error
      }
      return claimed
    },
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
    const address = {
      phoneNumberId: event.phoneNumberId,
      senderId: event.externalCustomerId,
    }
    try {
      await dependencies.cancelOnboarding?.(address)
    } finally {
      await dependencies.disconnect(address)
    }
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
      ...(event.timestamp
        ? { providerOccurredAt: new Date(Number(event.timestamp) * 1000) }
        : {}),
    })
    return true
  }
  // Verification and registration input must not become ordinary assistant/model history.
  if ((await dependencies.onboarding?.(event, config))?.handled) return true
  // A six-digit amount remains ordinary business input for a fresh linked binding.

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
  // Ordinary assistant turns survive dispatch failure; their model and reply work stays in jobs.
  return true
}
