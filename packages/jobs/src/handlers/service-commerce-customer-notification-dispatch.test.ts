import { describe, expect, test } from "bun:test"

import { runServiceCommerceCustomerNotificationDispatch } from "./service-commerce-customer-notification-dispatch"

const payload = {
  actorUserId: "user-1",
  intentId: "intent-1",
  storeId: "store-1",
  tenantId: "tenant-1",
}

const claim = {
  actions: [
    {
      action: "view_quote" as const,
      clientCapabilityId: "capability-1",
      label: "View quote",
    },
  ],
  attemptId: "attempt-1",
  attemptNumber: 1,
  channel: "whatsapp" as const,
  connectionId: "connection-1",
  credentialReference: "protected-credential",
  intentId: payload.intentId,
  maxAttempts: 3,
  phoneNumberId: "phone-number-1",
  protectedRecipient: "protected-recipient",
  templateKey: "ewatrade_customer_actions_available",
}

function provider(
  sendTemplate: (
    input: Record<string, unknown>,
  ) => Promise<{ messageId: string }>,
) {
  return {
    fetchMedia: async () => {
      throw new Error("not used")
    },
    getMediaDescriptor: async () => {
      throw new Error("not used")
    },
    readiness: async () => {
      throw new Error("not used")
    },
    sendButtons: async () => {
      throw new Error("not used")
    },
    sendMedia: async () => {
      throw new Error("not used")
    },
    sendTemplate,
    sendText: async () => {
      throw new Error("not used")
    },
  }
}

describe("Service Commerce customer notification dispatch", () => {
  test("reauthorizes before decrypting and sends only safe action links", async () => {
    const calls: unknown[] = []
    const result = await runServiceCommerceCustomerNotificationDispatch(
      payload,
      {
        assertProviderAllowed: async () => undefined,
        authorize: async (input) => {
          calls.push(["authorize", input])
          return true
        },
        claim: async (input) => {
          calls.push(["claim", input])
          return claim
        },
        complete: async (input) => calls.push(["complete", input]),
        fail: async (input) => calls.push(["fail", input]),
        provider: provider(async (input) => {
          calls.push(["sendTemplate", input])
          return { messageId: "provider-1" }
        }),
        resolveCredential: (reference) => {
          calls.push(["credential", reference])
          return "access-token"
        },
        resolveRecipient: (reference) => {
          calls.push(["recipient", reference])
          return "+2348000000000"
        },
      },
    )
    expect(result).toEqual({ messageId: "provider-1" })
    expect(calls[0]).toEqual(["claim", payload])
    expect(calls[1]).toEqual([
      "authorize",
      { ...payload, attemptId: "attempt-1", connectionId: "connection-1" },
    ])
    expect(calls[2]).toEqual(["credential", "protected-credential"])
    expect(calls[3]).toEqual(["recipient", "protected-recipient"])
    expect(JSON.stringify(calls[4])).toContain("/action/sca1.")
    expect(calls[4]).toEqual([
      "sendTemplate",
      expect.objectContaining({
        phoneNumberId: "phone-number-1",
        templateName: "ewatrade_customer_actions_available",
      }),
    ])
    expect(JSON.stringify(calls[4])).not.toContain("tenant-1")
    expect(calls[5]).toEqual([
      "complete",
      {
        ...payload,
        attemptId: "attempt-1",
        providerConnectionId: "connection-1",
        providerKey: "meta-cloud-api",
        providerOperationId: "provider-1",
      },
    ])
  })

  test("records bounded provider failure and does not decrypt without a claim", async () => {
    const failures: unknown[] = []
    await expect(
      runServiceCommerceCustomerNotificationDispatch(payload, {
        assertProviderAllowed: async () => undefined,
        authorize: async () => true,
        claim: async () => ({ ...claim, attemptNumber: 3 }),
        complete: async () => undefined,
        fail: async (input) => failures.push(input),
        provider: provider(async () => {
          throw new Error("provider unavailable")
        }),
        resolveCredential: () => "access-token",
        resolveRecipient: () => "+2348000000000",
      }),
    ).resolves.toBeNull()
    expect(failures).toEqual([
      {
        ...payload,
        attemptId: "attempt-1",
        failureCode: "customer_action_delivery_failed",
      },
    ])

    await expect(
      runServiceCommerceCustomerNotificationDispatch(payload, {
        assertProviderAllowed: async () => undefined,
        authorize: async () => true,
        claim: async () => null,
        complete: async () => undefined,
        fail: async () => undefined,
        provider: provider(async () => {
          throw new Error("must not send")
        }),
        resolveCredential: () => {
          throw new Error("must not decrypt")
        },
        resolveRecipient: () => {
          throw new Error("must not decrypt")
        },
      }),
    ).resolves.toBeNull()
  })

  test("reauthorizes after claim and never decrypts or sends when policy changes", async () => {
    const failures: unknown[] = []
    await expect(
      runServiceCommerceCustomerNotificationDispatch(payload, {
        assertProviderAllowed: async () => undefined,
        authorize: async () => false,
        claim: async () => claim,
        complete: async () => undefined,
        fail: async (input) => failures.push(input),
        provider: provider(async () => {
          throw new Error("must not send")
        }),
        resolveCredential: () => {
          throw new Error("must not decrypt")
        },
        resolveRecipient: () => {
          throw new Error("must not decrypt")
        },
      }),
    ).resolves.toBeNull()
    expect(failures).toEqual([
      {
        ...payload,
        attemptId: "attempt-1",
        failureCode: "customer_action_authorization_changed",
      },
    ])
  })
})
