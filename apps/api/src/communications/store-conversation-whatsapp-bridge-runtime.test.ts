import { describe, expect, test } from "bun:test"

import type {
  ConversationStateStore,
  NormalizedWhatsAppMessageEvent,
} from "@ewatrade/communications"
import { buildStoreConversationWhatsAppBridgeMessage } from "@ewatrade/service-commerce"

import {
  type StoreConversationWhatsAppBridgeInboundDependencies,
  processStoreConversationWhatsAppBridgeInbound,
} from "./store-conversation-whatsapp-bridge-runtime"

const digest = "d".repeat(64)

function message(
  overrides: Partial<NormalizedWhatsAppMessageEvent> = {},
): NormalizedWhatsAppMessageEvent {
  return {
    externalCustomerId: "+2348000000000",
    kind: "message",
    messageId: "provider_event_1",
    phoneNumberId: "phone_1",
    text: "Hello",
    type: "text",
    ...overrides,
  }
}

function stateStore() {
  const calls: Array<Record<string, unknown>> = []
  const state: ConversationStateStore = {
    get: async () => null,
    getRoutingSelection: async () => null,
    set: async (input) => {
      calls.push({ kind: "state", ...input })
    },
    setRoutingSelection: async (input) => {
      calls.push({ kind: "routing", ...input })
    },
  }
  return { calls, state }
}

function dependencies(
  overrides: Partial<StoreConversationWhatsAppBridgeInboundDependencies> = {},
) {
  const calls: Array<{ input: unknown; name: string }> = []
  const deps: StoreConversationWhatsAppBridgeInboundDependencies = {
    appendText: async (input) => {
      calls.push({ input, name: "appendText" })
      return null
    },
    consume: async (input) => {
      calls.push({ input, name: "consume" })
      return {
        bridgeId: "bridge_1",
        choices: ["start_new_request"],
        conversationId: "conversation_1",
        revision: 1,
        storeId: "store_1",
        tenantId: "tenant_1",
      }
    },
    digestToken: () => digest,
    enqueuePrompt: async (input) => {
      calls.push({ input, name: "enqueuePrompt" })
    },
    isBridgeError: () => false,
    protectRecipient: () => "recipient_ciphertext",
    resolveRoute: async (input) => {
      calls.push({ input, name: "resolveRoute" })
      return null
    },
    selectChoice: async (input) => {
      calls.push({ input, name: "selectChoice" })
      return {
        bridgeId: "bridge_1",
        choice: "start_new_request",
        conversationId: "conversation_1",
        promptRequired: true,
        source: { sourceId: null, sourceKind: null, sourceRevision: null },
        storeId: "store_1",
        tenantId: "tenant_1",
      }
    },
    selectRequestKind: async (input) => {
      calls.push({ input, name: "selectRequestKind" })
      return {
        bridgeId: "bridge_1",
        conversationId: "conversation_1",
        requestKind: "commerce_inquiry",
        storeId: "store_1",
        tenantId: "tenant_1",
      }
    },
    tokenServices: {
      deriveChoiceToken: () => "choice_token",
      digestToken: () => digest,
    },
    ...overrides,
  }
  return { calls, deps }
}

describe("Store Conversation WhatsApp bridge inbound module", () => {
  test("drops altered bridge-prefixed text before ordinary intake", async () => {
    const store = stateStore()
    const injected = dependencies()

    const result = await processStoreConversationWhatsAppBridgeInbound(
      {
        event: message({ text: "Continue on EwaTrade: invalid" }),
        route: { connectionId: "connection_1" },
        state: store.state,
      },
      injected.deps,
    )

    expect(result).toEqual({ handled: true })
    expect(injected.calls).toHaveLength(0)
    expect(store.calls).toHaveLength(0)
  })

  test("consumes an exact bridge code and durably schedules the choice prompt", async () => {
    const store = stateStore()
    const injected = dependencies()

    const result = await processStoreConversationWhatsAppBridgeInbound(
      {
        event: message({
          text: buildStoreConversationWhatsAppBridgeMessage("a".repeat(43)),
        }),
        route: { connectionId: "connection_1" },
        state: store.state,
      },
      injected.deps,
    )

    expect(result).toEqual({ handled: true })
    expect(injected.calls.map((call) => call.name)).toEqual([
      "consume",
      "enqueuePrompt",
    ])
    expect(store.calls).toEqual([
      {
        connectionId: "connection_1",
        externalCustomerId: "+2348000000000",
        kind: "routing",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    ])
  })

  test("keeps arbitrary content out while an explicit bridge choice is pending", async () => {
    const store = stateStore()
    const injected = dependencies({
      resolveRoute: async () => ({
        bridgeId: "bridge_1",
        choice: null,
        conversationId: "conversation_1",
        source: { sourceId: null, sourceKind: null, sourceRevision: null },
        state: "awaiting_choice",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    })

    const result = await processStoreConversationWhatsAppBridgeInbound(
      {
        event: message(),
        route: { connectionId: "connection_1" },
        state: store.state,
      },
      injected.deps,
    )

    expect(result).toEqual({ handled: true })
    expect(injected.calls).toHaveLength(0)
  })

  test("activates only the explicit Product request then waits for content", async () => {
    const store = stateStore()
    const injected = dependencies({
      resolveRoute: async () => ({
        bridgeId: "bridge_1",
        choice: "start_new_request",
        conversationId: "conversation_1",
        source: { sourceId: null, sourceKind: null, sourceRevision: null },
        state: "awaiting_request_kind",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    })

    const result = await processStoreConversationWhatsAppBridgeInbound(
      {
        event: message({
          quickActionId: "intent:product",
          type: "interactive",
        }),
        now: new Date("2026-08-16T10:00:00.000Z"),
        route: { connectionId: "connection_1" },
        state: store.state,
      },
      injected.deps,
    )

    expect(result).toEqual({ handled: true })
    expect(injected.calls.map((call) => call.name)).toEqual([
      "selectRequestKind",
    ])
    expect(store.calls.at(-1)).toMatchObject({
      connectionId: "connection_1",
      externalCustomerId: "+2348000000000",
      kind: "state",
      state: {
        intakeKind: "commerce_inquiry",
        lastSeenAt: "2026-08-16T10:00:00.000Z",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    })
  })

  test("appends supported continuation text and never reaches ordinary intake", async () => {
    const store = stateStore()
    const injected = dependencies({
      resolveRoute: async () => ({
        bridgeId: "bridge_1",
        choice: "continue_current_request",
        conversationId: "conversation_1",
        source: {
          sourceId: "inquiry_1",
          sourceKind: "COMMERCE_INQUIRY",
          sourceRevision: 3,
        },
        state: "active",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    })

    const result = await processStoreConversationWhatsAppBridgeInbound(
      {
        event: message({ text: "Continue this request" }),
        route: { connectionId: "connection_1" },
        state: store.state,
      },
      injected.deps,
    )

    expect(result).toEqual({ handled: true })
    expect(injected.calls.at(-1)).toMatchObject({
      input: {
        providerEventDigest: digest,
        storeId: "store_1",
        tenantId: "tenant_1",
        text: "Continue this request",
      },
      name: "appendText",
    })
  })

  test("passes only an explicitly activated new request into ordinary typed intake", async () => {
    const store = stateStore()
    const bridgeRoute = {
      bridgeId: "bridge_1",
      choice: "start_new_request" as const,
      conversationId: "conversation_1",
      source: { sourceId: null, sourceKind: null, sourceRevision: null },
      state: "active" as const,
      storeId: "store_1",
      tenantId: "tenant_1",
    }
    const injected = dependencies({ resolveRoute: async () => bridgeRoute })

    const result = await processStoreConversationWhatsAppBridgeInbound(
      {
        event: message({ text: "I need a red bag" }),
        route: { connectionId: "connection_1" },
        state: store.state,
      },
      injected.deps,
    )

    expect(result).toEqual({ bridgeRoute, handled: false })
    expect(store.calls).toEqual([
      {
        connectionId: "connection_1",
        externalCustomerId: "+2348000000000",
        kind: "routing",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    ])
  })
})
