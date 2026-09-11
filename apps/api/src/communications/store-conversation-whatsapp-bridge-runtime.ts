import type {
  ConversationStateStore,
  NormalizedWhatsAppMessageEvent,
} from "@ewatrade/communications"
import {
  customerChannelConversationContextId,
  prescriptionConversationContextId,
  protectCommunicationsRecipient,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  StoreConversationWhatsAppBridgeError,
  appendStoreConversationWhatsAppBridgeText,
  consumeStoreConversationWhatsAppBridge,
  resolveStoreConversationWhatsAppBridgeInboundRoute,
  selectStoreConversationWhatsAppBridgeChoice,
  selectStoreConversationWhatsAppBridgeRequestKind,
} from "@ewatrade/db/queries"
import { enqueueStoreConversationWhatsAppBridgePrompt } from "@ewatrade/jobs"
import {
  createStoreConversationWhatsAppBridgeTokenServices,
  extractStoreConversationWhatsAppBridgeToken,
  isStoreConversationWhatsAppBridgeChoiceCandidate,
  isStoreConversationWhatsAppBridgeMessageCandidate,
  parseStoreConversationWhatsAppBridgeChoiceToken,
  parseStoreConversationWhatsAppBridgeRequestKind,
} from "@ewatrade/service-commerce/server"

type BridgeRoute = Awaited<
  ReturnType<typeof resolveStoreConversationWhatsAppBridgeInboundRoute>
>

export type StoreConversationWhatsAppBridgeInboundDependencies = {
  appendText(
    input: Parameters<typeof appendStoreConversationWhatsAppBridgeText>[1],
  ): ReturnType<typeof appendStoreConversationWhatsAppBridgeText>
  consume(
    input: Parameters<typeof consumeStoreConversationWhatsAppBridge>[1],
  ): ReturnType<typeof consumeStoreConversationWhatsAppBridge>
  digestToken(value: string): string
  enqueuePrompt(
    input: Parameters<typeof enqueueStoreConversationWhatsAppBridgePrompt>[0],
  ): ReturnType<typeof enqueueStoreConversationWhatsAppBridgePrompt>
  isBridgeError(error: unknown): boolean
  protectRecipient(value: string): string
  resolveRoute(
    input: Parameters<
      typeof resolveStoreConversationWhatsAppBridgeInboundRoute
    >[1],
  ): ReturnType<typeof resolveStoreConversationWhatsAppBridgeInboundRoute>
  selectChoice(
    input: Parameters<typeof selectStoreConversationWhatsAppBridgeChoice>[1],
  ): ReturnType<typeof selectStoreConversationWhatsAppBridgeChoice>
  selectRequestKind(
    input: Parameters<
      typeof selectStoreConversationWhatsAppBridgeRequestKind
    >[1],
  ): ReturnType<typeof selectStoreConversationWhatsAppBridgeRequestKind>
  tokenServices: Parameters<
    typeof consumeStoreConversationWhatsAppBridge
  >[1]["tokenServices"]
}

function createProductionDependencies(): StoreConversationWhatsAppBridgeInboundDependencies {
  const tokenServices = createStoreConversationWhatsAppBridgeTokenServices()
  return {
    appendText: (input) =>
      appendStoreConversationWhatsAppBridgeText(prisma, input),
    consume: (input) => consumeStoreConversationWhatsAppBridge(prisma, input),
    digestToken: tokenServices.digestToken,
    enqueuePrompt: enqueueStoreConversationWhatsAppBridgePrompt,
    isBridgeError: (error) =>
      error instanceof StoreConversationWhatsAppBridgeError,
    protectRecipient: protectCommunicationsRecipient,
    resolveRoute: (input) =>
      resolveStoreConversationWhatsAppBridgeInboundRoute(prisma, input),
    selectChoice: (input) =>
      selectStoreConversationWhatsAppBridgeChoice(prisma, input),
    selectRequestKind: (input) =>
      selectStoreConversationWhatsAppBridgeRequestKind(prisma, input),
    tokenServices,
  }
}

type BridgeInboundResult =
  | { handled: true }
  | {
      bridgeRoute: Exclude<BridgeRoute, null> & {
        choice: "start_new_request"
        state: "active"
      }
      handled: false
    }
  | { bridgeRoute: null; handled: false }

function handled(): BridgeInboundResult {
  return { handled: true }
}

async function safelyRunBridgeCommand<T>(
  command: () => Promise<T>,
  dependencies: StoreConversationWhatsAppBridgeInboundDependencies,
) {
  try {
    return { ok: true as const, value: await command() }
  } catch (error) {
    if (!dependencies.isBridgeError(error)) throw error
    return { ok: false as const }
  }
}

/**
 * Owns every bridge-specific inbound decision before ordinary WhatsApp intake.
 * A handled result must never be persisted by the generic dispatcher.
 */
export async function processStoreConversationWhatsAppBridgeInbound(
  input: {
    event: NormalizedWhatsAppMessageEvent
    now?: Date
    route: { connectionId: string }
    state: ConversationStateStore
  },
  injected?: StoreConversationWhatsAppBridgeInboundDependencies,
): Promise<BridgeInboundResult> {
  const dependencies = injected ?? createProductionDependencies()
  const now = input.now ?? new Date()
  const bridgeToken = extractStoreConversationWhatsAppBridgeToken(
    input.event.text,
  )
  if (isStoreConversationWhatsAppBridgeMessageCandidate(input.event.text)) {
    if (!bridgeToken) return handled()
    const result = await safelyRunBridgeCommand(
      () =>
        dependencies.consume({
          bridgeTokenDigest: dependencies.digestToken(bridgeToken),
          connectionId: input.route.connectionId,
          externalCustomerIdCiphertext: dependencies.protectRecipient(
            input.event.externalCustomerId,
          ),
          externalCustomerIdDigest: dependencies.digestToken(
            input.event.externalCustomerId,
          ),
          now,
          tokenServices: dependencies.tokenServices,
        }),
      dependencies,
    )
    if (!result.ok) return handled()
    await input.state.setRoutingSelection({
      connectionId: input.route.connectionId,
      externalCustomerId: input.event.externalCustomerId,
      storeId: result.value.storeId,
      tenantId: result.value.tenantId,
    })
    await dependencies.enqueuePrompt({
      bridgeId: result.value.bridgeId,
      storeId: result.value.storeId,
      tenantId: result.value.tenantId,
    })
    return handled()
  }

  const choiceToken = input.event.quickActionId
    ? parseStoreConversationWhatsAppBridgeChoiceToken(input.event.quickActionId)
    : null
  if (
    choiceToken ||
    isStoreConversationWhatsAppBridgeChoiceCandidate(input.event.quickActionId)
  ) {
    if (!choiceToken) return handled()
    const result = await safelyRunBridgeCommand(
      () =>
        dependencies.selectChoice({
          choiceTokenDigest: dependencies.digestToken(choiceToken),
          connectionId: input.route.connectionId,
          externalCustomerIdDigest: dependencies.digestToken(
            input.event.externalCustomerId,
          ),
          now,
        }),
      dependencies,
    )
    if (!result.ok) return handled()
    const choice = result.value
    await input.state.setRoutingSelection({
      connectionId: input.route.connectionId,
      externalCustomerId: input.event.externalCustomerId,
      storeId: choice.storeId,
      tenantId: choice.tenantId,
    })
    if (choice.promptRequired) {
      await dependencies.enqueuePrompt({
        bridgeId: choice.bridgeId,
        storeId: choice.storeId,
        tenantId: choice.tenantId,
      })
    }
    if (
      choice.choice === "continue_current_request" &&
      choice.source.sourceId &&
      choice.source.sourceKind
    ) {
      const contextId =
        choice.source.sourceKind === "PRESCRIPTION_REQUEST"
          ? prescriptionConversationContextId(choice.storeId)
          : customerChannelConversationContextId(choice.storeId)
      await input.state.set({
        connectionId: input.route.connectionId,
        contextId,
        externalCustomerId: input.event.externalCustomerId,
        state: {
          contextId,
          ...(choice.source.sourceKind === "COMMERCE_INQUIRY"
            ? { intakeKind: "commerce_inquiry" as const }
            : {}),
          lastSeenAt: now.toISOString(),
          requestId: choice.source.sourceId,
          storeId: choice.storeId,
          tenantId: choice.tenantId,
        },
      })
    }
    return handled()
  }

  const externalCustomerIdDigest = dependencies.digestToken(
    input.event.externalCustomerId,
  )
  const routeResult = await safelyRunBridgeCommand(
    () =>
      dependencies.resolveRoute({
        connectionId: input.route.connectionId,
        externalCustomerIdDigest,
      }),
    dependencies,
  )
  if (!routeResult.ok) return handled()
  const bridgeRoute = routeResult.value
  if (!bridgeRoute) return { bridgeRoute: null, handled: false }
  if (bridgeRoute.state === "awaiting_choice") return handled()

  if (bridgeRoute.state === "awaiting_request_kind") {
    const requestKind = parseStoreConversationWhatsAppBridgeRequestKind(
      input.event.quickActionId ?? input.event.text,
    )
    if (!requestKind) return handled()
    const result = await safelyRunBridgeCommand(
      () =>
        dependencies.selectRequestKind({
          connectionId: input.route.connectionId,
          externalCustomerIdDigest,
          now,
          requestKind,
        }),
      dependencies,
    )
    if (!result.ok || !result.value) return handled()
    await input.state.setRoutingSelection({
      connectionId: input.route.connectionId,
      externalCustomerId: input.event.externalCustomerId,
      storeId: result.value.storeId,
      tenantId: result.value.tenantId,
    })
    const contextId = customerChannelConversationContextId(result.value.storeId)
    await input.state.set({
      connectionId: input.route.connectionId,
      contextId,
      externalCustomerId: input.event.externalCustomerId,
      state: {
        contextId,
        intakeKind: requestKind,
        lastSeenAt: now.toISOString(),
        storeId: result.value.storeId,
        tenantId: result.value.tenantId,
      },
    })
    return handled()
  }

  if (bridgeRoute.choice === "continue_current_request") {
    if (input.event.type !== "text" || !input.event.text) return handled()
    const result = await safelyRunBridgeCommand(
      () =>
        dependencies.appendText({
          connectionId: input.route.connectionId,
          externalCustomerIdDigest,
          now,
          providerEventDigest: dependencies.digestToken(input.event.messageId),
          storeId: bridgeRoute.storeId,
          tenantId: bridgeRoute.tenantId,
          text: input.event.text ?? "",
        }),
      dependencies,
    )
    if (!result.ok) return handled()
    return handled()
  }

  if (bridgeRoute.choice !== "start_new_request") return handled()
  await input.state.setRoutingSelection({
    connectionId: input.route.connectionId,
    externalCustomerId: input.event.externalCustomerId,
    storeId: bridgeRoute.storeId,
    tenantId: bridgeRoute.tenantId,
  })
  return {
    bridgeRoute: {
      ...bridgeRoute,
      choice: "start_new_request",
      state: "active",
    },
    handled: false,
  }
}
