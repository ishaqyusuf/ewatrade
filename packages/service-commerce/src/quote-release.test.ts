import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_DEFAULT_QUOTE_RELEASE_MODE,
  canTransitionServiceCommerceQuoteApproval,
  deriveServiceCommerceQuoteReleaseActions,
  getServiceCommerceQuoteApprovalDecisionKey,
  resolveServiceCommerceQuoteReleasePolicy,
} from "./quote-release"
import {
  serviceCommerceQuoteApprovalDecisionSchema,
  serviceCommerceQuoteReleasePolicySchema,
} from "./schemas/quote-release"

const policy = {
  mode: "approval_required" as const,
  revision: 4,
  selectedApproverMembershipIds: ["approver_1"],
}

const context = {
  actor: {
    attendantActive: true,
    membershipId: "attendant_1",
    quoteApproverActive: false,
  },
  activeApproverMembershipIds: ["approver_1"],
  clinicalReleaseReady: true,
  currentVersionId: "quote_version_2",
  decision: {
    id: "decision_1",
    lifecycle: "pending" as const,
    policyRevision: 4,
    quoteId: "quote_1",
    quoteVersionId: "quote_version_2",
    sourceId: "inquiry_1",
    sourceKind: "commerce_inquiry" as const,
    storeId: "store_1",
    tenantId: "tenant_1",
  },
  expiresAt: new Date("2026-08-11T13:00:00.000Z"),
  now: new Date("2026-08-11T12:00:00.000Z"),
  offerOptionsReady: true,
  policy,
  policyRevision: 4,
  quoteCreatorMembershipId: "attendant_1",
  quoteId: "quote_1",
  quoteVersionId: "quote_version_2",
  quoteVersionState: "draft" as const,
  sourceId: "inquiry_1",
  sourceKind: "commerce_inquiry" as const,
  storeId: "store_1",
  tenantId: "tenant_1",
  availabilityReady: true,
  verticalEligible: true,
}

describe("Service Commerce Quote release contracts", () => {
  test("uses the typed attendant-release compatibility default and fails closed for malformed policy input", () => {
    expect(SERVICE_COMMERCE_DEFAULT_QUOTE_RELEASE_MODE).toBe(
      "attendant_can_release",
    )
    expect(resolveServiceCommerceQuoteReleasePolicy(null)).toEqual({
      mode: "attendant_can_release",
      revision: 0,
      selectedApproverMembershipIds: [],
    })
    expect(
      serviceCommerceQuoteReleasePolicySchema.safeParse({
        mode: "approval_required",
        revision: 4,
        selectedApproverMembershipIds: [],
      }).success,
    ).toBe(false)
  })

  test("binds one pending decision to the exact Tenant, Store, Quote Version, and policy revision", () => {
    const decision = serviceCommerceQuoteApprovalDecisionSchema.parse({
      ...context.decision,
      requesterMembershipId: "attendant_1",
      requestedAt: context.now,
      sourceId: "inquiry_1",
      sourceKind: "commerce_inquiry",
    })
    expect(getServiceCommerceQuoteApprovalDecisionKey(decision)).toBe(
      "tenant_1:store_1:commerce_inquiry:inquiry_1:quote_1:quote_version_2:4",
    )
    expect(
      serviceCommerceQuoteApprovalDecisionSchema.safeParse({
        ...decision,
        policyRevision: 5,
        quoteVersionId: "quote_version_3",
      }).success,
    ).toBe(true)
  })

  test("requires a different active selected approver and current releasable facts", () => {
    expect(deriveServiceCommerceQuoteReleaseActions(context)).toEqual({
      canApprove: false,
      canPrepare: true,
      canReject: false,
      canRelease: false,
      canRequestApproval: false,
    })

    expect(
      deriveServiceCommerceQuoteReleaseActions({
        ...context,
        actor: {
          attendantActive: false,
          membershipId: "approver_1",
          quoteApproverActive: true,
        },
      }),
    ).toEqual({
      canApprove: true,
      canPrepare: false,
      canReject: true,
      canRelease: true,
      canRequestApproval: false,
    })

    expect(
      deriveServiceCommerceQuoteReleaseActions({
        ...context,
        activeApproverMembershipIds: [],
        actor: {
          attendantActive: false,
          membershipId: "approver_1",
          quoteApproverActive: true,
        },
      }).canApprove,
    ).toBe(false)
  })

  test("blocks release on stale policy, expiry, unavailable offer facts, or clinical readiness while allowing commercial rejection", () => {
    const approver = {
      attendantActive: false,
      membershipId: "approver_1",
      quoteApproverActive: true,
    }
    expect(
      deriveServiceCommerceQuoteReleaseActions({
        ...context,
        actor: approver,
        clinicalReleaseReady: false,
      }),
    ).toMatchObject({ canApprove: false, canReject: true, canRelease: false })
    expect(
      deriveServiceCommerceQuoteReleaseActions({
        ...context,
        actor: approver,
        policyRevision: 3,
      }),
    ).toEqual({
      canApprove: false,
      canPrepare: false,
      canReject: false,
      canRelease: false,
      canRequestApproval: false,
    })
    expect(
      deriveServiceCommerceQuoteReleaseActions({
        ...context,
        actor: approver,
        expiresAt: context.now,
        offerOptionsReady: false,
      }).canRelease,
    ).toBe(false)
  })

  test("allows only pending approval transitions and preserves terminal history", () => {
    expect(
      canTransitionServiceCommerceQuoteApproval("pending", "approved"),
    ).toBe(true)
    expect(
      canTransitionServiceCommerceQuoteApproval("pending", "rejected"),
    ).toBe(true)
    expect(
      canTransitionServiceCommerceQuoteApproval("pending", "superseded"),
    ).toBe(true)
    expect(
      canTransitionServiceCommerceQuoteApproval("approved", "superseded"),
    ).toBe(false)
    expect(
      canTransitionServiceCommerceQuoteApproval("rejected", "pending"),
    ).toBe(false)
  })
})
