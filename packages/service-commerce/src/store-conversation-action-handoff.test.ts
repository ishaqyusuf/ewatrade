import { describe, expect, test } from "bun:test"

import {
  StoreConversationActionHandoffError,
  completeStoreConversationActionHandoff,
} from "./store-conversation-action-handoff"

describe("Store Conversation action handoff", () => {
  test("adds only the provider-hosted URL to an executed Pharmacy payment action", async () => {
    const calls: unknown[] = []
    const result = await completeStoreConversationActionHandoff(
      {
        capabilityToken: "customer-action-capability-token",
        clientOperationId: "conversation-operation-1",
        result: {
          kind: "checkout",
          replayed: false,
          sourceKind: "prescription",
        },
      },
      {
        createPrescriptionCheckout: async (input) => {
          calls.push(input)
          return {
            checkoutUrl: "https://checkout.paystack.com/session-1",
            statusToken: "status-token",
          }
        },
      },
    )

    expect(calls).toEqual([
      {
        acceptanceToken: "customer-action-capability-token",
        clientPaymentId: expect.stringMatching(
          /^store-conversation-payment:[a-f0-9]{64}$/,
        ),
        statusToken: expect.any(String),
      },
    ])
    expect(result).toEqual({
      checkoutUrl: "https://checkout.paystack.com/session-1",
      kind: "checkout",
      replayed: false,
      sourceKind: "prescription",
    })
    expect(result).not.toHaveProperty("paid")
  })

  test("does not invoke payment handoff for a non-checkout action", async () => {
    let checkoutCalls = 0
    const result = await completeStoreConversationActionHandoff(
      {
        capabilityToken: "customer-action-capability-token",
        clientOperationId: "conversation-operation-2",
        result: {
          kind: "quote_option_selected",
          replayed: false,
          sourceKind: "commerce_inquiry",
        },
      },
      {
        createPrescriptionCheckout: async () => {
          checkoutCalls += 1
          throw new Error("unexpected checkout")
        },
      },
    )

    expect(result).toEqual({
      kind: "quote_option_selected",
      replayed: false,
      sourceKind: "commerce_inquiry",
    })
    expect(checkoutCalls).toBe(0)
  })

  test("redacts provider failures behind a bounded retry message", async () => {
    await expect(
      completeStoreConversationActionHandoff(
        {
          capabilityToken: "customer-action-capability-token",
          clientOperationId: "conversation-operation-failed",
          result: {
            kind: "checkout",
            replayed: true,
            sourceKind: "prescription",
          },
        },
        {
          createPrescriptionCheckout: async () => {
            throw new Error("provider secret and raw response")
          },
        },
      ),
    ).rejects.toEqual(
      new StoreConversationActionHandoffError(
        "Checkout is temporarily unavailable. Try again.",
      ),
    )
  })
})
