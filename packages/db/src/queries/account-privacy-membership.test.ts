import { afterEach, describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { revokeAccountPrivacyMembershipAccess } from "./account-privacy-membership"

const previousFlag = process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED
const previousBaseFlag = process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED
afterEach(() => {
  process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = previousFlag
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = previousBaseFlag
})

function fixture(
  input: {
    userId?: string | null
    verifiedSubjectUserId?: string | null
    accessStatus?: string
    operatorIsAdmin?: boolean
    emailVerified?: boolean
    contactEmail?: string
    otherOwners?: number
    teamAssignments?: number
    conversationAssignments?: number
    bookingResources?: number
    owner?: boolean
    membershipStatus?: string
    historicalRemovedMembership?: boolean
    profileOnHistoricalMembership?: boolean
  } = {},
) {
  const calls: string[] = []
  const audit: Array<Record<string, unknown>> = []
  const outcomes: Array<Record<string, unknown>> = []
  const membership = {
    id: "membership-1",
    tenantId: "tenant-1",
    role: input.owner ? "OWNER" : "OPERATOR",
    status: input.membershipStatus ?? "ACTIVE",
  }
  const profile = {
    id: "staff-1",
    tenantId: "tenant-1",
    membershipId: input.profileOnHistoricalMembership
      ? "membership-old"
      : membership.id,
    roleSnapshot: membership.role,
    statusSnapshot: "ACTIVE",
  }
  let invitationActive = true
  let invitationMutation: unknown
  let transactionOptions: unknown
  let teamAssignmentScope: unknown
  const db = {
    $transaction: async (
      operation: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ) => {
      transactionOptions = options
      return operation(db)
    },
    user: {
      findUnique: async () => ({
        isPlatformAdmin: input.operatorIsAdmin ?? true,
      }),
    },
    accountPrivacyRequest: {
      findUnique: async () => ({
        id: "request-1",
        userId: input.userId === undefined ? "user-1" : input.userId,
        contactEmail: input.contactEmail,
        user: {
          email: "user@example.test",
          emailVerified: input.emailVerified ?? true,
        },
        verifiedSubjectUserId:
          input.verifiedSubjectUserId === undefined
            ? "user-1"
            : input.verifiedSubjectUserId,
        verifiedAt: new Date("2026-09-24T12:00:00.000Z"),
        status: "PROCESSING",
        accessRevocation: {
          status: input.accessStatus ?? "REVOKED",
          userId: "user-1",
        },
      }),
    },
    membership: {
      findMany: async () => [
        ...(membership.status === "REMOVED" ? [] : [{ ...membership }]),
        ...(input.historicalRemovedMembership
          ? [{ ...membership, id: "membership-old", status: "REMOVED" }]
          : []),
      ],
      count: async ({ where }: { where: { userId: string | object } }) =>
        typeof where.userId === "string"
          ? Number(membership.status !== "REMOVED")
          : (input.otherOwners ?? 1),
      updateMany: async () => {
        const count = membership.status === "REMOVED" ? 0 : 1
        membership.status = "REMOVED"
        calls.push("membership-removed")
        return { count }
      },
    },
    serviceCommerceStoreTeamAssignment: {
      count: async (query: unknown) => {
        teamAssignmentScope = query
        return input.teamAssignments ?? 0
      },
    },
    storeConversation: {
      count: async () => input.conversationAssignments ?? 0,
    },
    serviceBookingResource: {
      count: async () => input.bookingResources ?? 0,
    },
    retailOpsStaffProfile: {
      findMany: async () =>
        profile.statusSnapshot === "REMOVED" ? [] : [{ ...profile }],
      updateMany: async () => {
        const count = profile.statusSnapshot === "REMOVED" ? 0 : 1
        profile.statusSnapshot = "REMOVED"
        calls.push("staff-removed")
        return { count }
      },
      count: async () => Number(profile.statusSnapshot !== "REMOVED"),
    },
    retailOpsStaffInviteToken: {
      updateMany: async (query: unknown) => {
        invitationMutation = query
        const count = invitationActive ? 1 : 0
        invitationActive = false
        calls.push("invite-revoked")
        return { count }
      },
      count: async () => Number(invitationActive),
    },
    retailOpsStaffLifecycleEvent: {
      createMany: async ({
        data,
      }: { data: Array<Record<string, unknown>> }) => {
        audit.push(...data)
        calls.push("audit-written")
        return { count: data.length }
      },
    },
    accountPrivacyDomainOutcome: {
      findUnique: async () => outcomes[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        outcomes.push(data)
        calls.push("outcome-written")
        return data
      },
    },
  }
  return {
    db: db as unknown as PrismaClient,
    calls,
    audit,
    outcomes,
    membership,
    profile,
    getInvitationMutation: () => invitationMutation,
    getTransactionOptions: () => transactionOptions,
    getTeamAssignmentScope: () => teamAssignmentScope,
  }
}

const command = {
  requestId: "request-1",
  operatorUserId: "operator-1",
  now: new Date("2026-09-25T00:00:00.000Z"),
}

describe("account privacy membership access stage", () => {
  test("is disabled by default", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "false"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "false"
    const current = fixture()
    await expect(
      revokeAccountPrivacyMembershipAccess(current.db, command),
    ).rejects.toMatchObject({ code: "DISABLED" })
    expect(current.calls).toEqual([])
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    await expect(
      revokeAccountPrivacyMembershipAccess(current.db, command),
    ).rejects.toMatchObject({ code: "DISABLED" })
  })

  test("requires the reviewed subject and completed access revocation", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    const unmatched = fixture({ verifiedSubjectUserId: "other-user" })
    await expect(
      revokeAccountPrivacyMembershipAccess(unmatched.db, command),
    ).rejects.toMatchObject({ code: "IDENTITY_REVIEW_REQUIRED" })
    const noAccessStage = fixture({ accessStatus: "FAILED" })
    await expect(
      revokeAccountPrivacyMembershipAccess(noAccessStage.db, command),
    ).rejects.toMatchObject({ code: "ACCESS_REVOCATION_REQUIRED" })
  })

  test("an externally verified subject can lose membership without claiming email-only invites", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    const current = fixture({ emailVerified: false })
    const result = await revokeAccountPrivacyMembershipAccess(
      current.db,
      command,
    )
    expect(result.membershipsRemoved).toBe(1)
    expect(result.emailInvitationReviewRequired).toBe(true)
    expect(result.outcomeRecorded).toBe(false)
    expect(current.outcomes).toHaveLength(0)
    expect(current.getInvitationMutation()).toMatchObject({
      where: {
        OR: [
          { membershipId: { in: ["membership-1"] } },
          { invitedUserId: "user-1" },
        ],
      },
    })
    expect(
      (current.getInvitationMutation() as { where: { OR: unknown[] } }).where
        .OR,
    ).toHaveLength(2)
  })

  test("requires a platform operator inside the transaction", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    const current = fixture({ operatorIsAdmin: false })
    await expect(
      revokeAccountPrivacyMembershipAccess(current.db, command),
    ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
    expect(current.calls).toEqual([])
  })

  test("refuses the last active owner and unfinished work handover", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    const soleOwner = fixture({ owner: true, otherOwners: 0 })
    await expect(
      revokeAccountPrivacyMembershipAccess(soleOwner.db, command),
    ).rejects.toMatchObject({ code: "OWNER_HANDOVER_REQUIRED" })
    expect(soleOwner.calls).toEqual([])
    const suspendedOwner = fixture({
      owner: true,
      membershipStatus: "SUSPENDED",
      otherOwners: 0,
    })
    await expect(
      revokeAccountPrivacyMembershipAccess(suspendedOwner.db, command),
    ).rejects.toMatchObject({ code: "OWNER_HANDOVER_REQUIRED" })
    const assigned = fixture({ conversationAssignments: 1 })
    await expect(
      revokeAccountPrivacyMembershipAccess(assigned.db, command),
    ).rejects.toMatchObject({ code: "WORK_HANDOVER_REQUIRED" })
    expect(assigned.calls).toEqual([])
    for (const input of [{ teamAssignments: 1 }, { bookingResources: 1 }]) {
      const unfinished = fixture(input)
      await expect(
        revokeAccountPrivacyMembershipAccess(unfinished.db, command),
      ).rejects.toMatchObject({ code: "WORK_HANDOVER_REQUIRED" })
      expect(unfinished.calls).toEqual([])
    }
  })

  test("checks work assignments on previously removed memberships too", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    const current = fixture({ historicalRemovedMembership: true })
    await revokeAccountPrivacyMembershipAccess(current.db, command)
    expect(current.getTeamAssignmentScope()).toMatchObject({
      where: {
        membershipId: { in: ["membership-1", "membership-old"] },
      },
    })
  })

  test("audits an active profile linked to a previously removed membership", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    const current = fixture({
      historicalRemovedMembership: true,
      profileOnHistoricalMembership: true,
    })
    await revokeAccountPrivacyMembershipAccess(current.db, command)
    expect(current.audit).toMatchObject([
      { membershipId: "membership-1", staffProfileId: null },
      { membershipId: "membership-old", staffProfileId: "staff-1" },
    ])
  })

  test("removes membership access, revokes invites and audits once", async () => {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    const current = fixture({ owner: true, otherOwners: 1 })
    const result = await revokeAccountPrivacyMembershipAccess(
      current.db,
      command,
    )
    expect(result).toEqual({
      requestId: "request-1",
      membershipAccessRevoked: true,
      membershipsRemoved: 1,
      staffProfilesRemoved: 1,
      invitationsRevoked: 1,
      emailInvitationReviewRequired: false,
      outcomeRecorded: false,
      replay: false,
    })
    expect(current.calls).toEqual([
      "membership-removed",
      "staff-removed",
      "invite-revoked",
      "audit-written",
    ])
    expect(current.audit).toMatchObject([
      {
        tenantId: "tenant-1",
        membershipId: "membership-1",
        staffProfileId: "staff-1",
        staffUserId: "user-1",
        actorUserId: "operator-1",
        type: "REMOVED",
        fromStatus: "ACTIVE",
        toStatus: "REMOVED",
      },
    ])
    expect(current.getInvitationMutation()).toMatchObject({
      where: {
        status: "ACTIVE",
        OR: [
          { membershipId: { in: ["membership-1"] } },
          { invitedUserId: "user-1" },
          {
            invitedUserId: null,
            email: {
              equals: "user@example.test",
              mode: "insensitive",
            },
          },
        ],
      },
    })
    expect(current.getTransactionOptions()).toEqual({
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 30_000,
    })
    const replay = await revokeAccountPrivacyMembershipAccess(
      current.db,
      command,
    )
    expect(replay.replay).toBe(true)
    expect(current.audit).toHaveLength(1)
  })

  test("records one policy-bound outcome only after postconditions and replays it", async () => {
    const previousPolicy = process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "approved-test-v1"
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    try {
      const current = fixture()
      const first = await revokeAccountPrivacyMembershipAccess(
        current.db,
        command,
      )
      expect(first.outcomeRecorded).toBe(true)
      expect(current.outcomes).toMatchObject([
        {
          requestId: "request-1",
          userId: "user-1",
          domain: "MEMBERSHIP",
          disposition: "ACCESS_REVOKED",
          processor: "account-privacy-membership-v1",
          policyVersion: "approved-test-v1",
        },
      ])
      expect(current.outcomes[0]?.evidenceDigest).toMatch(/^[a-f0-9]{64}$/)
      const replay = await revokeAccountPrivacyMembershipAccess(
        current.db,
        command,
      )
      expect(replay.replay).toBe(true)
      expect(replay.outcomeRecorded).toBe(true)
      expect(current.outcomes).toHaveLength(1)
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = ""
      await expect(
        revokeAccountPrivacyMembershipAccess(current.db, command),
      ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
    } finally {
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = previousPolicy
    }
  })

  test("keeps a different externally verified contact email for manual invitation review", async () => {
    const previousPolicy = process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "approved-test-v1"
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
    try {
      const current = fixture({ contactEmail: "other@example.test" })
      const result = await revokeAccountPrivacyMembershipAccess(
        current.db,
        command,
      )
      expect(result.emailInvitationReviewRequired).toBe(true)
      expect(result.outcomeRecorded).toBe(false)
      expect(current.outcomes).toHaveLength(0)
    } finally {
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = previousPolicy
    }
  })
})
