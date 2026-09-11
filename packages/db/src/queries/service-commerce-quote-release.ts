import { createHash } from "node:crypto"

import {
  type ServiceCommerceQuoteReleaseMode as SharedQuoteReleaseMode,
  resolveServiceCommerceQuoteReleasePolicy,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CommerceInquiryStatus,
  CommerceQuoteSourceType,
  CommerceQuoteVersionStatus,
  MembershipRole,
  MembershipStatus,
  PrescriptionRequestStatus,
  ServiceCommerceQuoteApprovalAuditEventType,
  ServiceCommerceQuoteApprovalStatus,
  ServiceCommerceQuoteReleaseMode,
  ServiceCommerceStoreTeamAssignmentStatus,
  ServiceCommerceStoreTeamAuditEventType,
  ServiceCommerceStoreTeamCapability,
  ServiceRequestStatus,
} from "../../generated/prisma/enums"
import type { DbClient } from "./types"

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

export class ServiceCommerceQuoteReleaseError extends Error {
  constructor(
    readonly code:
      | "CONFLICT"
      | "FORBIDDEN"
      | "IDEMPOTENCY_MISMATCH"
      | "INVALID_INPUT"
      | "NOT_FOUND",
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommerceQuoteReleaseError"
  }
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function mapMode(
  mode: ServiceCommerceQuoteReleaseMode,
): SharedQuoteReleaseMode {
  return mode === ServiceCommerceQuoteReleaseMode.APPROVAL_REQUIRED
    ? "approval_required"
    : "attendant_can_release"
}

function persistenceMode(mode: SharedQuoteReleaseMode) {
  return mode === "approval_required"
    ? ServiceCommerceQuoteReleaseMode.APPROVAL_REQUIRED
    : ServiceCommerceQuoteReleaseMode.ATTENDANT_CAN_RELEASE
}

async function assertStoreManager(
  db: DbClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const [membership, store] = await Promise.all([
    db.membership.findFirst({
      select: { id: true },
      where: {
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
    }),
    db.store.findFirst({
      select: { id: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    }),
  ])
  if (!membership || !store) {
    throw new ServiceCommerceQuoteReleaseError(
      "FORBIDDEN",
      "Owner or administrator access is required for quotation approval settings.",
    )
  }
  return membership
}

export async function resolveQuoteReleaseRuntimeFacts(
  db: DbClient,
  input: {
    actorUserId: string
    storeId: string
    tenantId: string
  },
) {
  const [membership, policy] = await Promise.all([
    db.membership.findFirst({
      select: { id: true, role: true, status: true },
      where: {
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
    }),
    db.serviceCommerceQuoteReleasePolicy.findFirst({
      select: {
        mode: true,
        revision: true,
        selectedApproverMembershipIds: true,
      },
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
  ])
  if (!membership) {
    throw new ServiceCommerceQuoteReleaseError(
      "FORBIDDEN",
      "An active Tenant membership is required for quotation work.",
    )
  }
  const parsedPolicy = resolveServiceCommerceQuoteReleasePolicy(
    policy
      ? {
          mode: mapMode(policy.mode),
          revision: policy.revision,
          selectedApproverMembershipIds: policy.selectedApproverMembershipIds,
        }
      : null,
  )
  const assignments = await db.serviceCommerceStoreTeamAssignment.findMany({
    select: { capability: true, membershipId: true },
    where: {
      capability: {
        in: [
          ServiceCommerceStoreTeamCapability.ATTENDANT,
          ServiceCommerceStoreTeamCapability.QUOTE_APPROVER,
        ],
      },
      membership: { status: MembershipStatus.ACTIVE },
      membershipId: {
        in: [
          ...new Set([
            membership.id,
            ...parsedPolicy.selectedApproverMembershipIds,
          ]),
        ],
      },
      status: ServiceCommerceStoreTeamAssignmentStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const activeApproverMembershipIds = assignments
    .filter(
      (assignment) =>
        assignment.capability ===
        ServiceCommerceStoreTeamCapability.QUOTE_APPROVER,
    )
    .map((assignment) => assignment.membershipId)
  return {
    activeApproverMembershipIds,
    actor: {
      attendantActive:
        !policy ||
        assignments.some(
          (assignment) =>
            assignment.capability ===
              ServiceCommerceStoreTeamCapability.ATTENDANT &&
            assignment.membershipId === membership.id,
        ),
      managerActive:
        membership.role === MembershipRole.OWNER ||
        membership.role === MembershipRole.ADMIN,
      membershipId: membership.id,
      quoteApproverActive: activeApproverMembershipIds.includes(membership.id),
    },
    compatibilityDefault: !policy,
    policy: parsedPolicy,
  }
}

export async function getServiceCommerceQuoteReleaseSettings(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  await assertStoreManager(db, input)
  const [policy, assignments, options] = await Promise.all([
    db.serviceCommerceQuoteReleasePolicy.findFirst({
      select: {
        id: true,
        mode: true,
        reason: true,
        revision: true,
        selectedApproverMembershipIds: true,
      },
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
    db.serviceCommerceStoreTeamAssignment.findMany({
      include: {
        membership: {
          include: {
            user: { select: { displayName: true, id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      where: {
        capability: ServiceCommerceStoreTeamCapability.QUOTE_APPROVER,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    db.membership.findMany({
      include: {
        user: { select: { displayName: true, id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
      where: {
        acceptedAt: { not: null },
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    }),
  ])
  const resolved = resolveServiceCommerceQuoteReleasePolicy(
    policy
      ? {
          mode: mapMode(policy.mode),
          revision: policy.revision,
          selectedApproverMembershipIds: policy.selectedApproverMembershipIds,
        }
      : null,
  )
  return {
    approvers: assignments.map((assignment) => ({
      assignmentId: assignment.id,
      membershipId: assignment.membershipId,
      name:
        assignment.membership.user.displayName ||
        assignment.membership.user.name ||
        "Team member",
      revision: assignment.revision,
      status:
        assignment.status === ServiceCommerceStoreTeamAssignmentStatus.ACTIVE &&
        assignment.membership.status === MembershipStatus.ACTIVE
          ? ("active" as const)
          : assignment.status ===
              ServiceCommerceStoreTeamAssignmentStatus.REVOKED
            ? ("removed" as const)
            : ("suspended" as const),
    })),
    policy: {
      ...resolved,
      persisted: Boolean(policy),
      reason: policy?.reason ?? null,
    },
    teamOptions: options.map((membership) => ({
      membershipId: membership.id,
      name:
        membership.user.displayName || membership.user.name || "Team member",
      userId: membership.user.id,
    })),
  }
}

export async function updateServiceCommerceQuoteReleaseSettings(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    expectedRevision: number
    mode: SharedQuoteReleaseMode
    reason: string
    selectedApproverMembershipIds: string[]
    storeId: string
    tenantId: string
  },
) {
  const selected = [...new Set(input.selectedApproverMembershipIds)].sort()
  if (selected.length !== input.selectedApproverMembershipIds.length) {
    throw new ServiceCommerceQuoteReleaseError(
      "INVALID_INPUT",
      "Selected quotation approvers must be unique.",
    )
  }
  if (input.mode === "approval_required" && selected.length < 1) {
    throw new ServiceCommerceQuoteReleaseError(
      "INVALID_INPUT",
      "Select at least one active quotation approver.",
    )
  }
  const payloadHash = stableHash({
    mode: input.mode,
    reason: input.reason.trim(),
    selected,
    storeId: input.storeId,
  })
  try {
    return await db.$transaction(async (tx) => {
      const managerMembership = await assertStoreManager(tx, input)
      const receipt =
        await tx.serviceCommerceQuoteReleaseCommandReceipt.findUnique({
          where: {
            tenantId_clientOperationId: {
              clientOperationId: input.clientOperationId,
              tenantId: input.tenantId,
            },
          },
        })
      if (receipt) {
        if (receipt.payloadHash !== payloadHash) {
          throw new ServiceCommerceQuoteReleaseError(
            "IDEMPOTENCY_MISMATCH",
            "This policy command identity was used with different input.",
          )
        }
        return { policyId: receipt.policyId, revision: receipt.policyRevision }
      }
      const current = await tx.serviceCommerceQuoteReleasePolicy.findFirst({
        where: { storeId: input.storeId, tenantId: input.tenantId },
      })
      if ((current?.revision ?? 0) !== input.expectedRevision) {
        throw new ServiceCommerceQuoteReleaseError(
          "CONFLICT",
          "Quotation approval settings changed before this save completed.",
        )
      }
      const memberships = selected.length
        ? await tx.membership.findMany({
            select: { id: true, userId: true },
            where: {
              acceptedAt: { not: null },
              id: { in: selected },
              status: MembershipStatus.ACTIVE,
              tenantId: input.tenantId,
            },
          })
        : []
      if (memberships.length !== selected.length) {
        throw new ServiceCommerceQuoteReleaseError(
          "INVALID_INPUT",
          "Every quotation approver must be an accepted active team member.",
        )
      }
      if (input.mode === "approval_required") {
        const attendants = await tx.serviceCommerceStoreTeamAssignment.findMany(
          {
            select: {
              membership: { select: { userId: true } },
              membershipId: true,
            },
            where: {
              capability: ServiceCommerceStoreTeamCapability.ATTENDANT,
              membership: {
                acceptedAt: { not: null },
                status: MembershipStatus.ACTIVE,
              },
              status: ServiceCommerceStoreTeamAssignmentStatus.ACTIVE,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          },
        )
        const hasMakerCheckerPair = attendants.some((attendant) =>
          memberships.some(
            (approver) => approver.userId !== attendant.membership.userId,
          ),
        )
        if (!hasMakerCheckerPair) {
          throw new ServiceCommerceQuoteReleaseError(
            "INVALID_INPUT",
            "Approval requires an active attendant and a different selected approver.",
          )
        }
      }
      const existingAssignments =
        await tx.serviceCommerceStoreTeamAssignment.findMany({
          where: {
            capability: ServiceCommerceStoreTeamCapability.QUOTE_APPROVER,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
      for (const membershipId of selected) {
        const assignment = await tx.serviceCommerceStoreTeamAssignment.upsert({
          create: {
            assignedByUserId: input.actorUserId,
            capability: ServiceCommerceStoreTeamCapability.QUOTE_APPROVER,
            membershipId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
          update: {
            assignedByUserId: input.actorUserId,
            revision: { increment: 1 },
            revokedAt: null,
            revokedByUserId: null,
            status: ServiceCommerceStoreTeamAssignmentStatus.ACTIVE,
            suspendedAt: null,
            suspendedByUserId: null,
          },
          where: {
            storeId_membershipId_capability: {
              capability: ServiceCommerceStoreTeamCapability.QUOTE_APPROVER,
              membershipId,
              storeId: input.storeId,
            },
          },
        })
        await tx.serviceCommerceStoreTeamAuditEvent.create({
          data: {
            actorUserId: input.actorUserId,
            assignmentId: assignment.id,
            assignmentRevision: assignment.revision,
            reason: input.reason.trim(),
            storeId: input.storeId,
            subjectMembershipId: membershipId,
            tenantId: input.tenantId,
            type: ServiceCommerceStoreTeamAuditEventType.ASSIGNED,
          },
        })
      }
      for (const assignment of existingAssignments) {
        if (
          selected.includes(assignment.membershipId) ||
          assignment.status === ServiceCommerceStoreTeamAssignmentStatus.REVOKED
        ) {
          continue
        }
        await tx.serviceCommerceStoreTeamAssignment.update({
          data: {
            revision: { increment: 1 },
            revokedAt: new Date(),
            revokedByUserId: input.actorUserId,
            status: ServiceCommerceStoreTeamAssignmentStatus.REVOKED,
          },
          where: { id: assignment.id },
        })
        await tx.serviceCommerceStoreTeamAuditEvent.create({
          data: {
            actorUserId: input.actorUserId,
            assignmentId: assignment.id,
            assignmentRevision: assignment.revision + 1,
            reason: input.reason.trim(),
            storeId: input.storeId,
            subjectMembershipId: assignment.membershipId,
            tenantId: input.tenantId,
            type: ServiceCommerceStoreTeamAuditEventType.REVOKED,
          },
        })
      }
      const nextRevision = input.expectedRevision + 1
      let policy: Awaited<
        ReturnType<typeof tx.serviceCommerceQuoteReleasePolicy.create>
      >
      if (current) {
        const changed = await tx.serviceCommerceQuoteReleasePolicy.updateMany({
          data: {
            mode: persistenceMode(input.mode),
            reason: input.reason.trim(),
            revision: nextRevision,
            selectedApproverMembershipIds: selected,
            updatedByUserId: input.actorUserId,
          },
          where: {
            id: current.id,
            revision: input.expectedRevision,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
        if (changed.count !== 1) {
          throw new ServiceCommerceQuoteReleaseError(
            "CONFLICT",
            "Quotation approval settings changed before this save completed.",
          )
        }
        policy = await tx.serviceCommerceQuoteReleasePolicy.findFirstOrThrow({
          where: {
            id: current.id,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
      } else {
        policy = await tx.serviceCommerceQuoteReleasePolicy.create({
          data: {
            mode: persistenceMode(input.mode),
            reason: input.reason.trim(),
            revision: nextRevision,
            selectedApproverMembershipIds: selected,
            storeId: input.storeId,
            tenantId: input.tenantId,
            updatedByUserId: input.actorUserId,
          },
        })
      }
      await tx.serviceCommerceQuoteReleasePolicyAuditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          fromMode: current?.mode ?? null,
          policyId: policy.id,
          policyRevision: policy.revision,
          reason: input.reason.trim(),
          selectedApproverMembershipIds: selected,
          storeId: input.storeId,
          tenantId: input.tenantId,
          toMode: policy.mode,
        },
      })
      const pendingApprovals = await tx.serviceCommerceQuoteApproval.findMany({
        select: { id: true, policyRevision: true, quoteVersionId: true },
        where: {
          status: ServiceCommerceQuoteApprovalStatus.PENDING,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (pendingApprovals.length > 0) {
        const supersededApprovals =
          await tx.serviceCommerceQuoteApproval.updateMany({
            data: {
              status: ServiceCommerceQuoteApprovalStatus.SUPERSEDED,
              supersededAt: new Date(),
            },
            where: {
              id: { in: pendingApprovals.map((approval) => approval.id) },
              status: ServiceCommerceQuoteApprovalStatus.PENDING,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          })
        if (supersededApprovals.count !== pendingApprovals.length) {
          throw new ServiceCommerceQuoteReleaseError(
            "CONFLICT",
            "A pending quotation decision changed during the policy update.",
          )
        }
        const supersededVersions = await tx.commerceQuoteVersion.updateMany({
          data: {
            status: CommerceQuoteVersionStatus.SUPERSEDED,
            supersededAt: new Date(),
          },
          where: {
            id: {
              in: pendingApprovals.map((approval) => approval.quoteVersionId),
            },
            status: CommerceQuoteVersionStatus.DRAFT,
          },
        })
        if (supersededVersions.count !== pendingApprovals.length) {
          throw new ServiceCommerceQuoteReleaseError(
            "CONFLICT",
            "A pending Quote Version changed during the policy update.",
          )
        }
        await tx.serviceCommerceQuoteApprovalAuditEvent.createMany({
          data: pendingApprovals.map((approval) => ({
            actorMembershipId: managerMembership.id,
            approvalId: approval.id,
            approvalStatus: ServiceCommerceQuoteApprovalStatus.SUPERSEDED,
            policyRevision: approval.policyRevision,
            reason: "Superseded by a quotation release policy revision.",
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: ServiceCommerceQuoteApprovalAuditEventType.SUPERSEDED,
          })),
        })
      }
      await tx.serviceCommerceQuoteReleaseCommandReceipt.create({
        data: {
          clientOperationId: input.clientOperationId,
          payloadHash,
          policyId: policy.id,
          policyRevision: policy.revision,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      return { policyId: policy.id, revision: policy.revision }
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" ||
        error.code === "P2025" ||
        error.code === "P2034")
    ) {
      throw new ServiceCommerceQuoteReleaseError(
        "CONFLICT",
        "Quotation approval settings changed before this save completed.",
      )
    }
    throw error
  }
}

type PendingApprovalForReconciliation = {
  id: string
  policyRevision: number
  quote: { currentVersionId: null | string }
  quoteVersion: {
    expiresAt: Date | null
    status: CommerceQuoteVersionStatus
  }
  quoteVersionId: string
  requesterMembershipId: string
  sourceId: string
  sourceType: CommerceQuoteSourceType
}

async function hasReleasablePendingSource(
  tx: DbClient,
  input: PendingApprovalForReconciliation & {
    storeId: string
    tenantId: string
  },
) {
  if (input.sourceType === CommerceQuoteSourceType.SERVICE_REQUEST) {
    return Boolean(
      await tx.serviceRequest.findFirst({
        select: { id: true },
        where: {
          id: input.sourceId,
          status: {
            in: [
              ServiceRequestStatus.SUBMITTED,
              ServiceRequestStatus.NEEDS_INFORMATION,
              ServiceRequestStatus.QUOTED,
            ],
          },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
    )
  }
  if (input.sourceType === CommerceQuoteSourceType.PRESCRIPTION_REQUEST) {
    return Boolean(
      await tx.prescriptionRequest.findFirst({
        select: { id: true },
        where: {
          id: input.sourceId,
          status: PrescriptionRequestStatus.READY_TO_QUOTE,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
    )
  }
  return Boolean(
    await tx.commerceInquiry.findFirst({
      select: { id: true },
      where: {
        id: input.sourceId,
        status: {
          in: [
            CommerceInquiryStatus.READY_TO_QUOTE,
            CommerceInquiryStatus.QUOTED,
          ],
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
  )
}

export async function supersedeServiceCommerceQuoteApprovalInTransaction(
  tx: DbClient,
  input: {
    actorMembershipId: string
    approvalId: string
    policyRevision: number
    quoteVersionId: string
    reason: string
    storeId: string
    tenantId: string
  },
) {
  const supersededAt = new Date()
  const changed = await tx.serviceCommerceQuoteApproval.updateMany({
    data: {
      status: ServiceCommerceQuoteApprovalStatus.SUPERSEDED,
      supersededAt,
    },
    where: {
      id: input.approvalId,
      status: ServiceCommerceQuoteApprovalStatus.PENDING,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (changed.count !== 1) return false
  await tx.commerceQuoteVersion.updateMany({
    data: {
      status: CommerceQuoteVersionStatus.SUPERSEDED,
      supersededAt,
    },
    where: {
      id: input.quoteVersionId,
      status: CommerceQuoteVersionStatus.DRAFT,
    },
  })
  await tx.serviceCommerceQuoteApprovalAuditEvent.create({
    data: {
      actorMembershipId: input.actorMembershipId,
      approvalId: input.approvalId,
      approvalStatus: ServiceCommerceQuoteApprovalStatus.SUPERSEDED,
      policyRevision: input.policyRevision,
      reason: input.reason,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceQuoteApprovalAuditEventType.SUPERSEDED,
    },
  })
  return true
}

export async function listPendingServiceCommerceQuoteApprovals(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  return db.$transaction(async (tx) => {
    const runtime = await resolveQuoteReleaseRuntimeFacts(tx, input)
    const membership = runtime.actor.membershipId
    const canReview =
      runtime.actor.managerActive ||
      runtime.actor.quoteApproverActive ||
      runtime.actor.attendantActive
    if (!canReview) return []
    const approvals = await tx.serviceCommerceQuoteApproval.findMany({
      include: {
        quote: { select: { currentVersionId: true } },
        quoteVersion: {
          select: {
            createdAt: true,
            currencyCode: true,
            expiresAt: true,
            status: true,
            totalMinor: true,
            version: true,
          },
        },
      },
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
      where: {
        status: ServiceCommerceQuoteApprovalStatus.PENDING,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const now = new Date()
    const visible: Array<{
      canApprove: boolean
      canReject: boolean
      currencyCode: string
      expiresAt: Date | null
      id: string
      policyRevision: number
      quoteId: string
      quoteVersionId: string
      requestedAt: Date
      sourceId: string
      sourceKind: "commerce_inquiry" | "prescription" | "service"
      totalMinor: number
      version: number
    }> = []
    for (const approval of approvals) {
      const hasDistinctActiveApprover =
        runtime.policy.mode === "approval_required" &&
        runtime.activeApproverMembershipIds.some(
          (candidate) =>
            candidate !== approval.requesterMembershipId &&
            runtime.policy.selectedApproverMembershipIds.includes(candidate),
        )
      const sourceReleasable = await hasReleasablePendingSource(tx, {
        ...approval,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      const current =
        approval.quote.currentVersionId === approval.quoteVersionId &&
        approval.quoteVersion.status === CommerceQuoteVersionStatus.DRAFT &&
        (!approval.quoteVersion.expiresAt ||
          approval.quoteVersion.expiresAt > now)
      if (
        !current ||
        !sourceReleasable ||
        !hasDistinctActiveApprover ||
        approval.policyRevision !== runtime.policy.revision
      ) {
        await supersedeServiceCommerceQuoteApprovalInTransaction(tx, {
          actorMembershipId: membership,
          approvalId: approval.id,
          policyRevision: approval.policyRevision,
          quoteVersionId: approval.quoteVersionId,
          reason:
            "Superseded because current release facts no longer match the pending decision.",
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        continue
      }
      const canDecide =
        runtime.actor.quoteApproverActive &&
        runtime.policy.selectedApproverMembershipIds.includes(membership) &&
        approval.requesterMembershipId !== membership
      visible.push({
        canApprove: canDecide,
        canReject: canDecide,
        currencyCode: approval.quoteVersion.currencyCode,
        expiresAt: approval.quoteVersion.expiresAt,
        id: approval.id,
        policyRevision: approval.policyRevision,
        quoteId: approval.quoteId,
        quoteVersionId: approval.quoteVersionId,
        requestedAt: approval.requestedAt,
        sourceId: approval.sourceId,
        sourceKind:
          approval.sourceType === "SERVICE_REQUEST"
            ? ("service" as const)
            : approval.sourceType === "PRESCRIPTION_REQUEST"
              ? ("prescription" as const)
              : ("commerce_inquiry" as const),
        totalMinor: approval.quoteVersion.totalMinor,
        version: approval.quoteVersion.version,
      })
    }
    return visible
  }, TRANSACTION_OPTIONS)
}
