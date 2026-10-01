import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"

export type AccountPrivacyMembershipCode =
  | "DISABLED"
  | "OPERATOR_REQUIRED"
  | "NOT_FOUND"
  | "IDENTITY_REVIEW_REQUIRED"
  | "ACCESS_REVOCATION_REQUIRED"
  | "OWNER_HANDOVER_REQUIRED"
  | "WORK_HANDOVER_REQUIRED"
  | "CLAIM_CONFLICT"

export class AccountPrivacyMembershipError extends Error {
  constructor(readonly code: AccountPrivacyMembershipCode) {
    super(code)
    this.name = "AccountPrivacyMembershipError"
  }
}

/** Removes account-owned business access only; it never completes deletion. */
export async function revokeAccountPrivacyMembershipAccess(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyMembershipError("DISABLED")
  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacyMembershipError("OPERATOR_REQUIRED")
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          userId: true,
          contactEmail: true,
          user: { select: { email: true, emailVerified: true } },
          verifiedSubjectUserId: true,
          verifiedAt: true,
          status: true,
          accessRevocation: { select: { status: true, userId: true } },
        },
      })
      if (!request) throw new AccountPrivacyMembershipError("NOT_FOUND")
      if (
        !request.userId ||
        request.userId === input.operatorUserId ||
        !request.verifiedAt ||
        request.verifiedSubjectUserId !== request.userId ||
        request.status !== "PROCESSING"
      ) {
        throw new AccountPrivacyMembershipError("IDENTITY_REVIEW_REQUIRED")
      }
      if (
        request.accessRevocation?.status !== "REVOKED" ||
        request.accessRevocation.userId !== request.userId
      ) {
        throw new AccountPrivacyMembershipError("ACCESS_REVOCATION_REQUIRED")
      }

      const subjectId = request.userId
      const verifiedEmail = request.user?.emailVerified
        ? request.user.email.trim().toLowerCase()
        : ""
      const invitationScope = [
        { invitedUserId: subjectId },
        ...(verifiedEmail
          ? [
              {
                invitedUserId: null,
                email: {
                  equals: verifiedEmail,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ]
      const allMemberships = await tx.membership.findMany({
        where: { userId: subjectId },
        select: { id: true, tenantId: true, role: true, status: true },
      })
      const memberships = allMemberships.filter(
        (membership) => membership.status !== "REMOVED",
      )
      const activeMembershipIds = memberships.map((membership) => membership.id)
      const membershipIds = allMemberships.map((membership) => membership.id)
      for (const membership of memberships) {
        if (membership.role !== "OWNER") continue
        const otherOwners = await tx.membership.count({
          where: {
            tenantId: membership.tenantId,
            userId: { not: subjectId },
            role: "OWNER",
            status: "ACTIVE",
          },
        })
        if (otherOwners === 0)
          throw new AccountPrivacyMembershipError("OWNER_HANDOVER_REQUIRED")
      }
      const teamAssignments = await tx.serviceCommerceStoreTeamAssignment.count(
        {
          where: {
            membershipId: { in: membershipIds },
            status: { not: "REVOKED" },
          },
        },
      )
      const conversationAssignments = await tx.storeConversation.count({
        where: {
          assignedMembershipId: { in: membershipIds },
          lifecycle: "ACTIVE",
        },
      })
      const bookingResources = await tx.serviceBookingResource.count({
        where: {
          membershipId: { in: membershipIds },
          status: "ACTIVE",
        },
      })
      if (teamAssignments || conversationAssignments || bookingResources)
        throw new AccountPrivacyMembershipError("WORK_HANDOVER_REQUIRED")

      const profiles = await tx.retailOpsStaffProfile.findMany({
        where: { userId: subjectId, statusSnapshot: { not: "REMOVED" } },
        select: {
          id: true,
          tenantId: true,
          membershipId: true,
          roleSnapshot: true,
          statusSnapshot: true,
        },
      })
      const removed = await tx.membership.updateMany({
        where: { userId: subjectId, status: { not: "REMOVED" } },
        data: { status: "REMOVED" },
      })
      if (removed.count !== memberships.length)
        throw new AccountPrivacyMembershipError("CLAIM_CONFLICT")
      const staff = await tx.retailOpsStaffProfile.updateMany({
        where: { userId: subjectId, statusSnapshot: { not: "REMOVED" } },
        data: { statusSnapshot: "REMOVED" },
      })
      if (staff.count !== profiles.length)
        throw new AccountPrivacyMembershipError("CLAIM_CONFLICT")
      const invitations = await tx.retailOpsStaffInviteToken.updateMany({
        where: {
          status: "ACTIVE",
          OR: [{ membershipId: { in: membershipIds } }, ...invitationScope],
        },
        data: {
          status: "REVOKED",
          revokedAt: now,
          revokedByUserId: input.operatorUserId,
        },
      })
      if (memberships.length || profiles.length) {
        const profileByMembership = new Map(
          profiles
            .filter((profile) => profile.membershipId)
            .map((profile) => [profile.membershipId, profile.id]),
        )
        await tx.retailOpsStaffLifecycleEvent.createMany({
          data: [
            ...memberships.map((membership) => ({
              tenantId: membership.tenantId,
              membershipId: membership.id,
              staffProfileId: profileByMembership.get(membership.id) ?? null,
              staffUserId: subjectId,
              actorUserId: input.operatorUserId,
              type: "REMOVED" as const,
              fromStatus: membership.status,
              toStatus: "REMOVED" as const,
              fromRole: membership.role,
              toRole: membership.role,
              happenedAt: now,
              reason: "Account privacy membership access removal",
            })),
            ...profiles
              .filter(
                (profile) =>
                  !profile.membershipId ||
                  !activeMembershipIds.includes(profile.membershipId),
              )
              .map((profile) => ({
                tenantId: profile.tenantId,
                membershipId: profile.membershipId,
                staffProfileId: profile.id,
                staffUserId: subjectId,
                actorUserId: input.operatorUserId,
                type: "REMOVED" as const,
                fromStatus: profile.statusSnapshot,
                toStatus: "REMOVED" as const,
                fromRole: profile.roleSnapshot,
                toRole: profile.roleSnapshot,
                happenedAt: now,
                reason: "Account privacy membership access removal",
              })),
          ],
        })
      }
      const remainingMemberships = await tx.membership.count({
        where: { userId: subjectId, status: { not: "REMOVED" } },
      })
      const remainingProfiles = await tx.retailOpsStaffProfile.count({
        where: { userId: subjectId, statusSnapshot: { not: "REMOVED" } },
      })
      const remainingInvitations = await tx.retailOpsStaffInviteToken.count({
        where: {
          status: "ACTIVE",
          OR: [{ membershipId: { in: membershipIds } }, ...invitationScope],
        },
      })
      if (remainingMemberships || remainingProfiles || remainingInvitations) {
        throw new AccountPrivacyMembershipError("CLAIM_CONFLICT")
      }
      const externalEmailNeedsReview =
        Boolean(request.contactEmail) &&
        request.contactEmail?.trim().toLowerCase() !== verifiedEmail
      const approvedPolicyVersion =
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
      const existingOutcome = await tx.accountPrivacyDomainOutcome.findUnique({
        where: {
          requestId_domain: { requestId: request.id, domain: "MEMBERSHIP" },
        },
        select: { userId: true, policyVersion: true, disposition: true },
      })
      if (
        existingOutcome &&
        (!approvedPolicyVersion ||
          existingOutcome.userId !== subjectId ||
          existingOutcome.disposition !== "ACCESS_REVOKED" ||
          existingOutcome.policyVersion !== approvedPolicyVersion)
      )
        throw new AccountPrivacyMembershipError("CLAIM_CONFLICT")
      // A missing policy approval or unverified current email leaves this
      // stage pending manual review, without certifying the domain.
      if (
        !existingOutcome &&
        approvedPolicyVersion &&
        request.user?.emailVerified &&
        !externalEmailNeedsReview
      ) {
        const evidenceDigest = createHash("sha256")
          .update(
            JSON.stringify({
              requestId: request.id,
              subjectId,
              operatorUserId: input.operatorUserId,
              processedAt: now.toISOString(),
              membershipsRemoved: removed.count,
              staffProfilesRemoved: staff.count,
              invitationsRevoked: invitations.count,
            }),
          )
          .digest("hex")
        await tx.accountPrivacyDomainOutcome.create({
          data: {
            requestId: request.id,
            userId: subjectId,
            domain: "MEMBERSHIP",
            disposition: "ACCESS_REVOKED",
            processor: "account-privacy-membership-v1",
            policyVersion: approvedPolicyVersion,
            evidenceDigest,
            processedAt: now,
          },
        })
      }
      return {
        requestId: request.id,
        membershipAccessRevoked: true,
        membershipsRemoved: removed.count,
        staffProfilesRemoved: staff.count,
        invitationsRevoked: invitations.count,
        emailInvitationReviewRequired:
          !request.user?.emailVerified || externalEmailNeedsReview,
        outcomeRecorded:
          Boolean(existingOutcome) ||
          Boolean(
            approvedPolicyVersion &&
              request.user?.emailVerified &&
              !externalEmailNeedsReview,
          ),
        replay:
          removed.count === 0 && staff.count === 0 && invitations.count === 0,
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}
