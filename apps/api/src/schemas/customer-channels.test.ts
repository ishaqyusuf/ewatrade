import { describe, expect, test } from "bun:test"

import {
  customerChannelAttendantAssignSchema,
  customerChannelEmbeddedSignupSessionSchema,
  customerChannelEntryPointRevokeSchema,
  customerChannelManualConnectionSchema,
  customerChannelQuoteApprovalDecisionSchema,
  customerChannelQuoteApprovalDetailSchema,
  customerChannelQuoteReleaseSettingsUpdateSchema,
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

  test("requires explicit revisioned quotation-approval settings", () => {
    expect(
      customerChannelQuoteReleaseSettingsUpdateSchema.parse({
        clientOperationId: "release-settings-001",
        expectedRevision: 0,
        mode: "approval_required",
        reason: "Require a second team member to review quotations",
        selectedApproverMembershipIds: ["membership_2"],
        storeId: "store_1",
      }),
    ).toEqual({
      clientOperationId: "release-settings-001",
      expectedRevision: 0,
      mode: "approval_required",
      reason: "Require a second team member to review quotations",
      selectedApproverMembershipIds: ["membership_2"],
      storeId: "store_1",
    })
    expect(
      customerChannelQuoteReleaseSettingsUpdateSchema.safeParse({
        clientOperationId: "release-settings-002",
        expectedRevision: 0,
        mode: "approval_required",
        reason: "Require approval",
        selectedApproverMembershipIds: [],
        storeId: "store_1",
      }).success,
    ).toBe(false)
  })

  test("binds an approval decision to exact approval, quote, version, and policy identities", () => {
    expect(
      customerChannelQuoteApprovalDecisionSchema.parse({
        approvalId: "approval_1",
        clientDecisionId: "approval-decision-001",
        expectedPolicyRevision: 4,
        quoteId: "quote_1",
        quoteVersionId: "quote_version_2",
        reason: "The quotation is accurate",
        storeId: "store_1",
      }),
    ).toMatchObject({
      approvalId: "approval_1",
      expectedPolicyRevision: 4,
      quoteId: "quote_1",
      quoteVersionId: "quote_version_2",
    })
    expect(
      customerChannelQuoteApprovalDecisionSchema.safeParse({
        approvalId: "approval_1",
        clientDecisionId: "approval-decision-001",
        quoteId: "quote_1",
        quoteVersionId: "quote_version_2",
        reason: "Approve",
        storeId: "store_1",
      }).success,
    ).toBe(false)
  })

  test("keeps direct approval sheet lookup Store-scoped and strict", () => {
    expect(
      customerChannelQuoteApprovalDetailSchema.safeParse({
        approvalId: "approval_1",
        storeId: "store_1",
        tenantId: "tenant_must_be_derived",
      }).success,
    ).toBe(false)
  })
})
