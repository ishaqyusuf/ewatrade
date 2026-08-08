import { describe, expect, test } from "bun:test"

import {
  prescriptionActivationSchema,
  prescriptionPrivacyRequestSchema,
  prescriptionPublicIntakeSchema,
  prescriptionQueueSchema,
  prescriptionRoleAssignmentSchema,
  prescriptionStoreSettingsUpdateSchema,
} from "./prescriptions"

describe("Prescription Commerce setup schemas", () => {
  test("accepts a complete store policy configuration", () => {
    expect(
      prescriptionStoreSettingsUpdateSchema.parse({
        consentVersion: "2026-08-08",
        contactPolicy:
          "Contact the customer only for fulfilment or clarification.",
        deliveryEnabled: false,
        operatingHours: [
          {
            closesAt: "18:00",
            day: "monday",
            isClosed: false,
            opensAt: "08:00",
          },
        ],
        pickupEnabled: true,
        servicePolicy: "Pharmacist review is required before quotation.",
        storeId: "store_1",
      }),
    ).toMatchObject({ pickupEnabled: true, storeId: "store_1" })
  })

  test("rejects an open day without valid opening and closing times", () => {
    expect(() =>
      prescriptionStoreSettingsUpdateSchema.parse({
        consentVersion: "2026-08-08",
        contactPolicy: "Customer contact policy",
        deliveryEnabled: false,
        operatingHours: [{ day: "monday", isClosed: false }],
        pickupEnabled: true,
        servicePolicy: "Service policy",
        storeId: "store_1",
      }),
    ).toThrow()
  })

  test("accepts role and activation commands with explicit store scope", () => {
    expect(
      prescriptionRoleAssignmentSchema.parse({
        credentialReference: "PCN-reference",
        credentialVerified: true,
        role: "pharmacist",
        storeId: "store_1",
        userId: "user_1",
      }),
    ).toMatchObject({ role: "pharmacist" })
    expect(
      prescriptionActivationSchema.parse({ active: true, storeId: "store_1" }),
    ).toEqual({ active: true, storeId: "store_1" })
  })

  test("accepts bounded private-media intake and rejects missing consent", () => {
    const input = {
      clientRequestId: "request-1",
      consentAccepted: true,
      consentVersion: "2026-08-08",
      customerPhone: "+2348000000000",
      fulfilmentPreference: "pickup",
      media: [
        {
          clientMediaId: "media-1",
          mediaType: "image/jpeg",
          objectKey: "private/tenant/store/request/page-1",
          originalFileName: "prescription.jpg",
          pageNumber: 1,
          sha256: "a".repeat(64),
          sizeBytes: 1024,
        },
      ],
      publicToken: "channel-token-with-enough-entropy",
    }
    expect(prescriptionPublicIntakeSchema.parse(input)).toMatchObject({
      fulfilmentPreference: "pickup",
    })
    expect(() =>
      prescriptionPublicIntakeSchema.parse({
        ...input,
        consentAccepted: false,
      }),
    ).toThrow()
  })

  test("bounds and allowlists queue pagination, filters, and sort", () => {
    expect(
      prescriptionQueueSchema.parse({
        pageSize: 25,
        sort: ["created_at", "desc"],
        sources: ["web", "whatsapp"],
        statuses: ["media_review", "pharmacist_review"],
        storeId: "store-1",
      }),
    ).toMatchObject({ pageSize: 25 })
    expect(() =>
      prescriptionQueueSchema.parse({
        pageSize: 101,
        sort: ["customer_phone", "asc"],
        storeId: "store-1",
      }),
    ).toThrow()
  })

  test("requires structured changes for correction privacy requests", () => {
    const base = {
      reason: "Customer supplied verified corrected information.",
      storeId: "store-1",
      subjectReference: "RX-REFERENCE",
      type: "correction" as const,
    }
    expect(() => prescriptionPrivacyRequestSchema.parse(base)).toThrow()
    expect(
      prescriptionPrivacyRequestSchema.parse({
        ...base,
        requestedChanges: { customerName: "Corrected name" },
      }),
    ).toMatchObject({ type: "correction" })
  })
})
