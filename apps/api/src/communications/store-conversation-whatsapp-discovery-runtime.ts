import type { NormalizedWhatsAppMessageEvent } from "@ewatrade/communications"
import { protectCommunicationsRecipient } from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  StoreConversationWhatsAppDiscoveryError,
  discoverStoreConversationWhatsAppCandidate,
  holdStoreConversationWhatsAppAmbiguousRecovery,
  selectStoreConversationWhatsAppCandidateAction,
} from "@ewatrade/db/queries"
import {
  enqueueServiceCommerceWhatsAppInbound,
  enqueueStoreConversationWhatsAppCandidatePrompt,
  enqueueStoreConversationWhatsAppRecovery,
} from "@ewatrade/jobs"
import {
  createStoreConversationWhatsAppBridgeTokenServices,
  digestStoreConversationNotificationDestination,
  isStoreConversationWhatsAppCandidateActionCandidate,
  parseStoreConversationWhatsAppCandidateActionToken,
} from "@ewatrade/service-commerce/server"

type StoreRoute = {
  connectionId: string
  routeVertical: "pharmacy" | "service"
  storeId: string
  tenantId: string
}

type Dependencies = {
  digest(value: string): string
  digestNotificationDestination(value: string): string
  discover(
    input: Parameters<typeof discoverStoreConversationWhatsAppCandidate>[1],
  ): ReturnType<typeof discoverStoreConversationWhatsAppCandidate>
  enqueueCandidatePrompt(
    input: Parameters<
      typeof enqueueStoreConversationWhatsAppCandidatePrompt
    >[0],
  ): ReturnType<typeof enqueueStoreConversationWhatsAppCandidatePrompt>
  enqueueInbound(eventId: string): Promise<unknown>
  enqueueRecovery(
    input: Parameters<typeof enqueueStoreConversationWhatsAppRecovery>[0],
  ): ReturnType<typeof enqueueStoreConversationWhatsAppRecovery>
  holdAmbiguous(
    input: Parameters<
      typeof holdStoreConversationWhatsAppAmbiguousRecovery
    >[1],
  ): ReturnType<typeof holdStoreConversationWhatsAppAmbiguousRecovery>
  isDiscoveryError(error: unknown): boolean
  protectRecipient(value: string): string
  selectAction(
    input: Parameters<typeof selectStoreConversationWhatsAppCandidateAction>[1],
  ): ReturnType<typeof selectStoreConversationWhatsAppCandidateAction>
  tokenServices: Parameters<
    typeof discoverStoreConversationWhatsAppCandidate
  >[1]["tokenServices"]
}

function productionDependencies(): Dependencies {
  const services = createStoreConversationWhatsAppBridgeTokenServices()
  return {
    digest: services.digestToken,
    digestNotificationDestination: (destination) =>
      digestStoreConversationNotificationDestination({
        channel: "whatsapp",
        destination,
      }),
    discover: (input) =>
      discoverStoreConversationWhatsAppCandidate(prisma, input),
    enqueueCandidatePrompt: enqueueStoreConversationWhatsAppCandidatePrompt,
    enqueueInbound: enqueueServiceCommerceWhatsAppInbound,
    enqueueRecovery: enqueueStoreConversationWhatsAppRecovery,
    holdAmbiguous: (input) =>
      holdStoreConversationWhatsAppAmbiguousRecovery(prisma, input),
    isDiscoveryError: (error) =>
      error instanceof StoreConversationWhatsAppDiscoveryError,
    protectRecipient: protectCommunicationsRecipient,
    selectAction: (input) =>
      selectStoreConversationWhatsAppCandidateAction(prisma, input),
    tokenServices: {
      deriveActionToken: services.deriveCandidateActionToken,
      digestToken: services.digestToken,
    },
  }
}

function normalizedRecipient(value: string) {
  const digits = value.trim().replace(/^\+/, "")
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
}

export async function processStoreConversationWhatsAppCandidateAction(
  input: {
    event: NormalizedWhatsAppMessageEvent
    now?: Date
    route: StoreRoute
  },
  injected?: Dependencies,
) {
  const dependencies = injected ?? productionDependencies()
  const quickActionId = input.event.quickActionId
  if (!quickActionId) return { handled: false as const }
  const actionToken =
    parseStoreConversationWhatsAppCandidateActionToken(quickActionId)
  if (!actionToken) {
    return {
      handled:
        isStoreConversationWhatsAppCandidateActionCandidate(quickActionId),
    }
  }
  const recipient = normalizedRecipient(input.event.externalCustomerId)
  if (!recipient) return { handled: true as const }
  try {
    const result = await dependencies.selectAction({
      actionTokenDigest: dependencies.digest(actionToken),
      connectionId: input.route.connectionId,
      externalCustomerIdCiphertext: dependencies.protectRecipient(
        input.event.externalCustomerId,
      ),
      externalCustomerIdDigest: dependencies.digest(
        input.event.externalCustomerId,
      ),
      normalizedExternalCustomerId: recipient,
      now: input.now,
      storeId: input.route.storeId,
      tenantId: input.route.tenantId,
    })
    if (result.state === "start_new") {
      await dependencies.enqueueInbound(result.inboundEventId)
    }
  } catch (error) {
    if (!dependencies.isDiscoveryError(error)) throw error
  }
  return { handled: true as const }
}

export async function discoverStoreConversationWhatsAppInboundCandidate(
  input: {
    event: NormalizedWhatsAppMessageEvent
    inboundEventId: string
    now?: Date
    route: StoreRoute
  },
  injected?: Dependencies,
) {
  if (
    input.event.type !== "text" ||
    !input.event.text?.trim() ||
    input.route.routeVertical !== "service"
  ) {
    return { held: false as const }
  }
  const dependencies = injected ?? productionDependencies()
  const recipient = normalizedRecipient(input.event.externalCustomerId)
  if (!recipient) return { held: false as const }
  try {
    const result = await dependencies.discover({
      connectionId: input.route.connectionId,
      externalCustomerIdDigest: dependencies.digest(
        input.event.externalCustomerId,
      ),
      inboundEventId: input.inboundEventId,
      notificationDestinationDigest:
        dependencies.digestNotificationDestination(recipient),
      normalizedExternalCustomerId: recipient,
      now: input.now,
      providerEventDigest: dependencies.digest(input.event.messageId),
      storeId: input.route.storeId,
      tenantId: input.route.tenantId,
      tokenServices: dependencies.tokenServices,
    })
    if (result.state === "ambiguous") {
      const recovery = await dependencies.holdAmbiguous({
        connectionId: input.route.connectionId,
        inboundEventId: input.inboundEventId,
        now: input.now,
        storeId: input.route.storeId,
        tenantId: input.route.tenantId,
      })
      await dependencies.enqueueRecovery({
        attemptId: recovery.attemptId,
        storeId: input.route.storeId,
        tenantId: input.route.tenantId,
      })
      return { held: true as const }
    }
    if (result.state !== "held") return { held: false as const }
    await dependencies.enqueueCandidatePrompt({
      candidateId: result.candidateId,
      storeId: input.route.storeId,
      tenantId: input.route.tenantId,
    })
    return { held: true as const }
  } catch (error) {
    if (!dependencies.isDiscoveryError(error)) throw error
    return { held: true as const }
  }
}
