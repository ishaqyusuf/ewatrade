import { describe, expect, test } from "bun:test"

import type { WhatsAppProvider } from "@ewatrade/communications"

import { runWhatsAppConnectionTest } from "./whatsapp-connection-test"

function createProvider(
  testConnection: WhatsAppProvider["testConnection"],
): WhatsAppProvider {
  return {
    key: "fake-meta",
    discover: async () => [],
    exchangeEmbeddedSignupCode: async () => ({ accessToken: "unused" }),
    fetchMedia: async () => ({
      bytes: new Uint8Array(),
      mediaType: "image/jpeg",
    }),
    sendButtons: async () => ({ messageId: "unused" }),
    sendTemplate: async () => ({ messageId: "unused" }),
    sendText: async () => ({ messageId: "unused" }),
    testConnection,
  }
}

const connection = {
  credentialReference: "active-reference",
  displayNumber: "+2348000000000",
  pendingCredentialReference: "pending-reference",
  phoneNumberId: "phone-1",
  testRecipient: "+234 811 111 1111",
  wabaId: "waba-1",
}

describe("WhatsApp connection test job", () => {
  test("verifies the pending credential, number, webhook, templates, and outbound route", async () => {
    const providerInputs: unknown[] = []
    const records: unknown[] = []
    const result = await runWhatsAppConnectionTest(
      { connectionId: "connection-1", tenantId: "tenant-1" },
      {
        assertProviderAllowed: async () => undefined,
        load: async () => connection,
        provider: createProvider(async (input) => {
          providerInputs.push(input)
          return {
            businessVerified: true,
            displayNumber: connection.displayNumber,
            numberVerified: true,
            outboundVerified: true,
            templateConfiguration: { pickup_ready: "approved" },
            templatesReady: true,
            webhookSubscribed: true,
          }
        }),
        record: async (input) => {
          records.push(input)
        },
        resolveCredential: (reference) => `resolved:${reference}`,
      },
    )

    expect(result.outboundVerified).toBe(true)
    expect(providerInputs).toEqual([
      {
        accessToken: "resolved:pending-reference",
        phoneNumberId: "phone-1",
        testRecipient: "2348111111111",
        wabaId: "waba-1",
      },
    ])
    expect(records[0]).toMatchObject({
      connectionId: "connection-1",
      numberVerified: true,
      outboundVerified: true,
      templatesReady: true,
      tenantId: "tenant-1",
      webhookSubscribed: true,
    })
  })

  test("persists a failed readiness result and rethrows for durable retry", async () => {
    const records: unknown[] = []
    await expect(
      runWhatsAppConnectionTest(
        { connectionId: "connection-1", tenantId: "tenant-1" },
        {
          assertProviderAllowed: async () => undefined,
          load: async () => ({
            ...connection,
            pendingCredentialReference: null,
          }),
          provider: createProvider(async () => {
            throw new Error("Meta unavailable")
          }),
          record: async (input) => {
            records.push(input)
          },
          resolveCredential: (reference) => `resolved:${reference}`,
        },
      ),
    ).rejects.toThrow("Meta unavailable")
    expect(records[0]).toMatchObject({
      connectionId: "connection-1",
      failureCode: "connection_test_failed",
      outboundVerified: false,
      tenantId: "tenant-1",
    })
  })
})
