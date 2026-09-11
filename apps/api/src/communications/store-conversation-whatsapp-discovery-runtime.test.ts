import { describe, expect, test } from "bun:test"

import type { NormalizedWhatsAppMessageEvent } from "@ewatrade/communications"

import {
  discoverStoreConversationWhatsAppInboundCandidate,
  processStoreConversationWhatsAppCandidateAction,
} from "./store-conversation-whatsapp-discovery-runtime"

const actionToken = `ewc1_${"a".repeat(43)}`
const event: NormalizedWhatsAppMessageEvent = {
  externalCustomerId: "2348000000000",
  kind: "message",
  messageId: "provider_message_private",
  phoneNumberId: "phone_1",
  text: "I need the red bag",
  type: "text",
}
const route = {
  connectionId: "connection_1",
  routeVertical: "service" as const,
  storeId: "store_1",
  tenantId: "tenant_1",
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    digest: (value: string) =>
      value === actionToken ? "a".repeat(64) : "d".repeat(64),
    digestNotificationDestination: () => "f".repeat(64),
    discover: async () => ({
      candidateId: "candidate_1",
      replayed: false,
      state: "held" as const,
    }),
    enqueueCandidatePrompt: async () => undefined,
    enqueueInbound: async () => undefined,
    enqueueRecovery: async () => undefined,
    holdAmbiguous: async () => ({ attemptId: "recovery_1", replayed: false }),
    isDiscoveryError: () => false,
    protectRecipient: () => "recipient_ciphertext",
    selectAction: async () => ({
      inboundEventId: "inbound_held",
      replayed: false,
      state: "start_new" as const,
    }),
    tokenServices: {
      deriveActionToken: () => actionToken,
      digestToken: () => "d".repeat(64),
    },
    ...overrides,
  }
}

describe("Store Conversation direct WhatsApp runtime", () => {
  test("holds one eligible inbound message and enqueues only an identifier prompt", async () => {
    const calls: unknown[] = []
    const result = await discoverStoreConversationWhatsAppInboundCandidate(
      { event, inboundEventId: "inbound_1", route },
      dependencies({
        discover: async (input: unknown) => {
          calls.push({ input, kind: "discover" })
          return {
            candidateId: "candidate_1",
            replayed: false,
            state: "held" as const,
          }
        },
        enqueueCandidatePrompt: async (input: unknown) => {
          calls.push({ input, kind: "enqueue" })
        },
      }),
    )

    expect(result).toEqual({ held: true })
    expect(calls[1]).toEqual({
      input: {
        candidateId: "candidate_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
      kind: "enqueue",
    })
    expect(JSON.stringify(calls[1])).not.toContain("red bag")
    expect(JSON.stringify(calls[0])).not.toContain("provider_message_private")
    expect(calls[0]).toEqual({
      input: expect.objectContaining({
        externalCustomerIdDigest: "d".repeat(64),
        notificationDestinationDigest: "f".repeat(64),
      }),
      kind: "discover",
    })
  })

  test("consumes a Store-scoped explicit Start new choice and requeues the held event", async () => {
    const enqueued: string[] = []
    const result = await processStoreConversationWhatsAppCandidateAction(
      {
        event: { ...event, quickActionId: actionToken, type: "interactive" },
        route,
      },
      dependencies({
        enqueueInbound: async (eventId: string) => {
          enqueued.push(eventId)
        },
        selectAction: async (input: Record<string, unknown>) => {
          expect(input).toMatchObject({
            actionTokenDigest: "a".repeat(64),
            connectionId: "connection_1",
            storeId: "store_1",
            tenantId: "tenant_1",
          })
          return {
            inboundEventId: "inbound_held",
            replayed: false,
            state: "start_new" as const,
          }
        },
      }),
    )

    expect(result).toEqual({ handled: true })
    expect(enqueued).toEqual(["inbound_held"])
  })

  test("holds ambiguous matches and queues only an identifier recovery", async () => {
    const queued: unknown[] = []
    const result = await discoverStoreConversationWhatsAppInboundCandidate(
      { event, inboundEventId: "inbound_1", route },
      dependencies({
        discover: async () => ({ replayed: false, state: "ambiguous" as const }),
        enqueueCandidatePrompt: async () => {
          throw new Error("candidate prompt must not be queued")
        },
        enqueueRecovery: async (input: unknown) => queued.push(input),
        holdAmbiguous: async (input: Record<string, unknown>) => {
          expect(input).toEqual({
            connectionId: "connection_1",
            inboundEventId: "inbound_1",
            now: undefined,
            storeId: "store_1",
            tenantId: "tenant_1",
          })
          return { attemptId: "recovery_1", replayed: false }
        },
      }),
    )

    expect(result).toEqual({ held: true })
    expect(queued).toEqual([
      {
        attemptId: "recovery_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    ])
    expect(JSON.stringify(queued)).not.toMatch(/customer|message|token/i)
  })

  test("releases a true no-match event to the existing typed Product intake", async () => {
    const result = await discoverStoreConversationWhatsAppInboundCandidate(
      { event, inboundEventId: "inbound_1", route },
      dependencies({
        discover: async () => ({ replayed: false, state: "new_request" as const }),
      }),
    )

    expect(result).toEqual({ held: false })
  })

  test("swallows malformed candidate actions without reaching ordinary intake", async () => {
    const result = await processStoreConversationWhatsAppCandidateAction(
      {
        event: { ...event, quickActionId: "ewc1_invalid", type: "interactive" },
        route,
      },
      dependencies(),
    )

    expect(result).toEqual({ handled: true })
  })
})
