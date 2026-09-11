import { describe, expect, test } from "bun:test"

import { runServiceCommerceBookingNotificationDispatch } from "./service-commerce-booking-notification-dispatch"

const payload = {
  actorUserId: "user_1",
  intentId: "intent_1",
  storeId: "store_1",
  tenantId: "tenant_1",
}

const claim = {
  bookingId: "booking_1",
  channel: "whatsapp",
  intentId: payload.intentId,
  recipientCiphertext: "enc:v1:recipient",
  tenantDataClassification: "LIVE" as const,
  scheduledEndAt: new Date("2026-08-12T10:00:00.000Z"),
  scheduledStartAt: new Date("2026-08-12T09:00:00.000Z"),
  type: "confirmation",
} as const

describe("Service Commerce booking notification dispatch", () => {
  test("claims and reauthorizes before decrypting the recipient or dispatching", async () => {
    const calls: unknown[] = []
    const result = await runServiceCommerceBookingNotificationDispatch(
      payload,
      1,
      {
        claim: async (input) => {
          calls.push(["claim", input])
          return claim
        },
        complete: async (input) => calls.push(["complete", input]),
        fail: async (input) => calls.push(["fail", input]),
        messaging: {
          send: async (input) => {
            calls.push(["send", input])
            return { providerKey: "service_whatsapp_webhook", status: "sent" }
          },
        },
        resolveRecipient: (ciphertext) => {
          calls.push(["decrypt", ciphertext])
          return "+2348000000000"
        },
      },
    )

    expect(result).toEqual({
      providerKey: "service_whatsapp_webhook",
      status: "sent",
    })
    expect(calls).toEqual([
      ["claim", payload],
      ["decrypt", "enc:v1:recipient"],
      [
        "send",
        {
          channel: "whatsapp",
          intentId: "intent_1",
          message: "Your booking has been confirmed.",
          tenantDataClassification: "LIVE",
          to: "+2348000000000",
        },
      ],
      ["complete", payload],
    ])
  })

  test("records a bounded retry and rethrows only while another attempt is allowed", async () => {
    const failures: Array<{ failureCode: string; retryAt?: Date }> = []
    await expect(
      runServiceCommerceBookingNotificationDispatch(payload, 1, {
        claim: async () => claim,
        complete: async () => undefined,
        fail: async (input) => failures.push(input),
        messaging: {
          send: async () => {
            throw new Error("provider unavailable")
          },
        },
        resolveRecipient: () => "+2348000000000",
      }),
    ).rejects.toThrow("provider unavailable")
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      failureCode: "provider_delivery_failed",
    })
    expect(failures[0]?.retryAt).toBeInstanceOf(Date)

    const terminalFailures: Array<{ failureCode: string; retryAt?: Date }> = []
    await expect(
      runServiceCommerceBookingNotificationDispatch(payload, 3, {
        claim: async () => claim,
        complete: async () => undefined,
        fail: async (input) => terminalFailures.push(input),
        messaging: {
          send: async () => {
            throw new Error("provider unavailable")
          },
        },
        resolveRecipient: () => "+2348000000000",
      }),
    ).rejects.toThrow("provider unavailable")
    expect(terminalFailures).toEqual([
      { ...payload, failureCode: "provider_delivery_failed" },
    ])
  })

  test("does not decrypt or send when the scoped claim is unavailable", async () => {
    await expect(
      runServiceCommerceBookingNotificationDispatch(payload, 1, {
        claim: async () => null,
        complete: async () => {
          throw new Error("not used")
        },
        fail: async () => {
          throw new Error("not used")
        },
        messaging: {
          send: async () => {
            throw new Error("not used")
          },
        },
        resolveRecipient: () => {
          throw new Error("not used")
        },
      }),
    ).resolves.toBeNull()
  })
})
