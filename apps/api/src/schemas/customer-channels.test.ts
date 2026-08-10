import { describe, expect, test } from "bun:test"

import {
  customerChannelAttendantAssignSchema,
  customerChannelEmbeddedSignupSessionSchema,
  customerChannelEntryPointRevokeSchema,
  customerChannelManualConnectionSchema,
  customerChannelStoreBindingsSchema,
} from "./customer-channels"

describe("customer channel API contracts", () => {
  test("normalizes one manual WhatsApp connection candidate", () => {
    expect(
      customerChannelManualConnectionSchema.parse({
        accessToken: "x".repeat(32),
        billingOwner: " Business ",
        businessDisplayName: " Main Line ",
        displayNumber: " +2348000000000 ",
        phoneNumberId: " phone_1 ",
        storeId: " store_1 ",
        testRecipient: " +2348111111111 ",
        wabaId: " waba_1 ",
      }),
    ).toMatchObject({
      billingOwner: "Business",
      businessDisplayName: "Main Line",
      phoneNumberId: "phone_1",
      storeId: "store_1",
      wabaId: "waba_1",
    })
  })

  test("requires unique explicit Store assignments", () => {
    expect(
      customerChannelStoreBindingsSchema.safeParse({
        connectionId: "connection_1",
        storeIds: ["store_1", "store_1"],
      }).success,
    ).toBe(false)
  })

  test("uses membership identity and bounded reason for attendant assignment", () => {
    expect(
      customerChannelAttendantAssignSchema.parse({
        membershipId: "membership_1",
        reason: "Route customer requests",
        storeId: "store_1",
      }),
    ).toEqual({
      membershipId: "membership_1",
      reason: "Route customer requests",
      storeId: "store_1",
    })
  })

  test("requires optimistic revision to revoke an entry point", () => {
    expect(
      customerChannelEntryPointRevokeSchema.safeParse({
        entryPointId: "entry_1",
        reason: "Stop public intake",
        storeId: "store_1",
      }).success,
    ).toBe(false)
  })

  test("keeps Embedded Signup bearer tokens out of dashboard URL contracts", () => {
    expect(
      customerChannelEmbeddedSignupSessionSchema.safeParse({
        publicToken: "bearer-token-that-must-not-enter-the-url",
        storeId: "store_1",
      }).success,
    ).toBe(false)
    expect(
      customerChannelEmbeddedSignupSessionSchema.parse({ storeId: "store_1" }),
    ).toEqual({ storeId: "store_1" })
  })
})
