import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"

import {
  InMemoryConversationStateStore,
  conversationStateKey,
  createEmbeddedSignupState,
  customerChannelConversationContextId,
  extractCustomerChannelIntakeSelection,
  extractWhatsAppChannelContext,
  isWithinWhatsAppSessionWindow,
  issueServiceCommerceCustomerActionToken,
  parseMetaWhatsAppEvents,
  prescriptionConversationContextId,
  protectCommunicationsActionId,
  protectCommunicationsCredential,
  protectCommunicationsRecipient,
  resolveCommunicationsActionId,
  resolveCommunicationsCredential,
  resolveCommunicationsRecipient,
  verifyEmbeddedSignupState,
  verifyMetaWebhookSignature,
} from "./index"

describe("direct Meta WhatsApp contract", () => {
  test("issues deterministic opaque customer-action capabilities", () => {
    const input = {
      clientCapabilityId: "capability-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    }
    const first = issueServiceCommerceCustomerActionToken(input)
    expect(first).toBe(issueServiceCommerceCustomerActionToken(input))
    expect(first).toStartWith("sca1.")
    expect(first).not.toContain("tenant-1")
    expect(first).not.toContain("store-1")
  })

  test("validates signatures before parsing normalized inbound events", () => {
    const body = JSON.stringify({ entry: [] })
    const signature = `sha256=${createHmac("sha256", "secret")
      .update(body)
      .digest("hex")}`
    expect(
      verifyMetaWebhookSignature({ appSecret: "secret", body, signature }),
    ).toBe(true)
    expect(parseMetaWhatsAppEvents(JSON.parse(body))).toEqual([])
  })

  test("normalizes Meta delivery and read receipts", () => {
    const events = parseMetaWhatsAppEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone-1" },
                statuses: [
                  { id: "wamid.1", status: "delivered", timestamp: "1" },
                  { id: "wamid.1", status: "read", timestamp: "2" },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(events).toEqual([
      {
        failureCode: undefined,
        kind: "status",
        messageId: "wamid.1",
        phoneNumberId: "phone-1",
        status: "delivered",
        timestamp: "1",
      },
      {
        failureCode: undefined,
        kind: "status",
        messageId: "wamid.1",
        phoneNumberId: "phone-1",
        status: "read",
        timestamp: "2",
      },
    ])
  })

  test("includes connection, customer, and bounded context in Redis keys", () => {
    expect(
      conversationStateKey({
        connectionId: "connection-1",
        contextId: "request-1",
        externalCustomerId: "2348000000000",
      }),
    ).toBe("rxwa:connection-1:2348000000000:request-1")
    expect(
      conversationStateKey({
        connectionId: "connection-2",
        contextId: "request-1",
        externalCustomerId: "2348000000000",
      }),
    ).not.toBe("rxwa:connection-1:2348000000000:request-1")
  })

  test("isolates the same customer on a central connection by Store", () => {
    const common = {
      connectionId: "connection-1",
      externalCustomerId: "2348000000000",
    }
    expect(
      conversationStateKey({
        ...common,
        contextId: prescriptionConversationContextId("store-1"),
      }),
    ).not.toBe(
      conversationStateKey({
        ...common,
        contextId: prescriptionConversationContextId("store-2"),
      }),
    )
  })

  test("keeps two pharmacy threads for one customer independent", async () => {
    const state = new InMemoryConversationStateStore()
    const common = {
      connectionId: "central-connection",
      externalCustomerId: "2348000000000",
    }
    for (const storeId of ["store-1", "store-2"]) {
      const contextId = prescriptionConversationContextId(storeId)
      await state.set({
        ...common,
        contextId,
        state: {
          contextId,
          lastSeenAt: "2026-08-09T00:00:00.000Z",
          requestId: `request-${storeId}`,
          storeId,
          tenantId: "tenant-1",
        },
      })
    }

    expect(
      await state.get({
        ...common,
        contextId: prescriptionConversationContextId("store-1"),
      }),
    ).toMatchObject({ requestId: "request-store-1", storeId: "store-1" })
    expect(
      await state.get({
        ...common,
        contextId: prescriptionConversationContextId("store-2"),
      }),
    ).toMatchObject({ requestId: "request-store-2", storeId: "store-2" })
    await state.setRoutingSelection({
      ...common,
      storeId: "store-2",
      tenantId: "tenant-1",
    })
    expect(await state.getRoutingSelection(common)).toEqual({
      storeId: "store-2",
      tenantId: "tenant-1",
    })
  })

  test("uses a business-neutral Store conversation context", () => {
    expect(customerChannelConversationContextId("store-1")).toBe(
      "customer-channel-store:store-1",
    )
  })

  test("extracts only an explicit opaque Store routing context", () => {
    const token = "branch_token_1234567890"
    expect(extractWhatsAppChannelContext(`Start rxstore:${token}`)).toBe(token)
    expect(extractWhatsAppChannelContext(`Start ewastore:${token}`)).toBe(token)
    expect(
      extractWhatsAppChannelContext("Send my prescription here"),
    ).toBeNull()
  })

  test("extracts only an explicit generic intake selection", () => {
    expect(
      extractCustomerChannelIntakeSelection(
        "Start ewastore:opaque intent:product",
      ),
    ).toBe("commerce_inquiry")
    expect(
      extractCustomerChannelIntakeSelection("Is this available?"),
    ).toBeNull()
  })

  test("enforces the Meta 24-hour customer service window", () => {
    const now = new Date("2026-08-08T12:00:00Z")
    expect(
      isWithinWhatsAppSessionWindow(new Date("2026-08-07T12:00:01Z"), now),
    ).toBe(true)
    expect(
      isWithinWhatsAppSessionWindow(new Date("2026-08-07T11:59:59Z"), now),
    ).toBe(false)
  })

  test("stores provider credentials as encrypted references", () => {
    const reference = protectCommunicationsCredential("private-access-token")
    expect(reference).not.toContain("private-access-token")
    expect(resolveCommunicationsCredential(reference)).toBe(
      "private-access-token",
    )
  })

  test("keeps raw quick-action bearer tokens out of durable payloads", () => {
    const reference = protectCommunicationsActionId("rx:opaque-action")
    expect(reference).not.toContain("rx:opaque-action")
    expect(resolveCommunicationsActionId(reference)).toBe("rx:opaque-action")
  })

  test("encrypts booking notification recipients before persistence", () => {
    const reference = protectCommunicationsRecipient("+2348000000000")
    expect(reference).not.toContain("+2348000000000")
    expect(resolveCommunicationsRecipient(reference)).toBe("+2348000000000")
  })

  test("signs Embedded Signup state and rejects tampered or expired callbacks", () => {
    const secret = "embedded-signup-secret"
    const state = createEmbeddedSignupState(
      {
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "owner-1",
      },
      secret,
    )
    expect(verifyEmbeddedSignupState(state, secret)).toMatchObject({
      storeId: "store-1",
      tenantId: "tenant-1",
      userId: "owner-1",
    })
    expect(verifyEmbeddedSignupState(`${state}tampered`, secret)).toBeNull()

    const expiredPayload = Buffer.from(
      JSON.stringify({
        expiresAt: Date.now() - 1,
        nonce: "expired-nonce",
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "owner-1",
      }),
    ).toString("base64url")
    const expiredSignature = createHmac("sha256", secret)
      .update(expiredPayload)
      .digest("base64url")
    expect(
      verifyEmbeddedSignupState(
        `${expiredPayload}.${expiredSignature}`,
        secret,
      ),
    ).toBeNull()
  })
})
