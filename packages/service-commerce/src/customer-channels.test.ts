import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_CHANNEL_CONNECTION_LIFECYCLES,
  SERVICE_COMMERCE_CHANNEL_CONNECTION_READINESS,
  SERVICE_COMMERCE_ENTRY_POINT_ACTIONS,
  SERVICE_COMMERCE_PUBLIC_ENTRY_ACTIONS,
  getServiceCommerceEntryPointPublishBlockers,
  projectServiceCommerceEntryPoint,
  serviceCommerceChannelConnectionProjectionSchema,
  serviceCommerceManualWhatsAppConnectionSchema,
  serviceCommerceStoreAttendantAssignmentInputSchema,
  serviceCommerceStoreAttendantAssignmentStatusSchema,
  serviceCommerceStoreBindingConfigurationSchema,
} from "."

describe("Customer Channels contracts", () => {
  test("projects connection lifecycle and readiness without provider credentials", () => {
    expect(SERVICE_COMMERCE_CHANNEL_CONNECTION_LIFECYCLES).toEqual([
      "pending",
      "active",
      "suspended",
      "revoked",
      "replaced",
    ])
    expect(SERVICE_COMMERCE_CHANNEL_CONNECTION_READINESS).toEqual([
      "setup_required",
      "configuration_required",
      "test_required",
      "ready",
      "blocked",
    ])
    expect(
      serviceCommerceChannelConnectionProjectionSchema.parse({
        id: "connection-1",
        lifecycle: "active",
        provider: "whatsapp",
        readiness: "ready",
        storeAssignments: [{ id: "store-1", name: "Main Store" }],
      }),
    ).toEqual({
      id: "connection-1",
      lifecycle: "active",
      provider: "whatsapp",
      readiness: "ready",
      storeAssignments: [{ id: "store-1", name: "Main Store" }],
    })
    expect(
      serviceCommerceChannelConnectionProjectionSchema.safeParse({
        credentialReference: "secret",
        id: "connection-1",
        lifecycle: "active",
        provider: "whatsapp",
        readiness: "ready",
        storeAssignments: [],
      }).success,
    ).toBe(false)
  })

  test("accepts only existing active memberships as Store attendant assignments", () => {
    expect(
      serviceCommerceStoreAttendantAssignmentInputSchema.parse({
        membershipId: "membership-1",
      }),
    ).toEqual({ membershipId: "membership-1" })
    expect(
      serviceCommerceStoreAttendantAssignmentInputSchema.safeParse({
        membershipId: " ",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceStoreAttendantAssignmentStatusSchema.parse({
        membershipId: "membership-1",
        status: "active",
      }),
    ).toEqual({ membershipId: "membership-1", status: "active" })
  })

  test("blocks entry-point publication until an active attendant and allowed channel exist", () => {
    expect(
      getServiceCommerceEntryPointPublishBlockers({
        attendants: [{ membershipId: "membership-1", status: "suspended" }],
        channels: [
          { channel: "web", readiness: "restricted" },
          { channel: "whatsapp", readiness: "unavailable" },
        ],
      }),
    ).toEqual(["active_attendant_missing", "allowed_channel_missing"])
  })

  test("projects stable entry actions only when the Store can publish", () => {
    expect(SERVICE_COMMERCE_ENTRY_POINT_ACTIONS).toEqual([
      "copy_link",
      "download_qr",
    ])
    expect(
      projectServiceCommerceEntryPoint({
        attendants: [{ membershipId: "membership-1", status: "active" }],
        channels: [
          { channel: "web", readiness: "available" },
          { channel: "whatsapp", readiness: "unavailable" },
        ],
        entryPoint: {
          entryToken: "opaque-entry-token",
          id: "entry-point-1",
          status: "published",
        },
      }),
    ).toEqual({
      actions: ["copy_link", "download_qr"],
      entryToken: "opaque-entry-token",
      id: "entry-point-1",
      publishBlockers: [],
      status: "published",
    })
  })

  test("keeps public request actions distinct from management link actions", () => {
    expect(SERVICE_COMMERCE_PUBLIC_ENTRY_ACTIONS).toEqual([
      "request_online",
      "chat_on_whatsapp",
    ])
  })

  test("validates manual provider setup and explicit unique Store bindings", () => {
    expect(
      serviceCommerceManualWhatsAppConnectionSchema.parse({
        accessToken: "x".repeat(32),
        displayNumber: "+2348000000000",
        phoneNumberId: "phone-1",
        testRecipient: "+2348111111111",
        wabaId: "waba-1",
      }),
    ).toMatchObject({ phoneNumberId: "phone-1", wabaId: "waba-1" })
    expect(
      serviceCommerceStoreBindingConfigurationSchema.safeParse({
        connectionId: "connection-1",
        storeIds: ["store-1", "store-1"],
      }).success,
    ).toBe(false)
  })
})
