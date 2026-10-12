import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { buildStaffInvitationLinks } from "@ewatrade/utils/staff-invitation-links"
import {
  assertStaffInvitationCustodyConfigured,
  sealStaffInvitationPayload,
  staffInvitationPayloadHash,
} from "../staff-invitation-custody"
import {
  assertStaffStoreAccessAuthority,
  STAFF_STORE_ACCESS_ROLLOUT_READY,
} from "./staff-store-access"
import {
  inviteRetailOpsStaffInTransaction,
  writeDurableRetailOpsStaffInvite,
} from "./retail-ops-staff"
import { cancelStaffInvitationNotificationsInTransaction } from "./staff-invitation-notifications"
import {
  staffInvitationCommandReceiptSchema as receiptSchema,
  staffInvitationSavedReviewSchema,
} from "./staff-invitation-command-receipt"
import {
  reviewStaffInvitationInTransaction,
  staffInvitationReviewInput,
} from "./staff-invitation-review"

const id = z.string().trim().min(1).max(160)
const reason = z.string().trim().min(1).max(500)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const inviteReview = z
  .object({ kind: z.literal("INVITE"), invite: staffInvitationReviewInput })
  .strict()
const resendReview = z
  .object({ kind: z.literal("RESEND"), invitationId: id, reason })
  .strict()
const revokeReview = z
  .object({ kind: z.literal("REVOKE"), invitationId: id, reason })
  .strict()
export const staffInvitationCommandReviewInput = z.discriminatedUnion("kind", [
  inviteReview,
  resendReview,
  revokeReview,
])
const commandFields = { clientCommandId: id, expectedReviewHash: digest }
export const staffInvitationCommandInput = z.discriminatedUnion("kind", [
  inviteReview.extend(commandFields).strict(),
  resendReview.extend(commandFields).strict(),
  revokeReview.extend(commandFields).strict(),
])
export type StaffInvitationCommandInput = z.infer<
  typeof staffInvitationCommandInput
>
type Scope = { actorUserId: string; tenantId: string }
type ReviewInput = z.infer<typeof staffInvitationCommandReviewInput>
type Tx = Prisma.TransactionClient

export class StaffInvitationCommandError extends Error {
  constructor(
    public readonly code: "CONFLICT" | "NOT_FOUND" | "PRECONDITION_FAILED",
    message: string,
  ) {
    super(message)
    this.name = "StaffInvitationCommandError"
  }
}
export type StaffInvitationCommandReceipt = z.infer<typeof receiptSchema>
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

async function lifecycle(tx: Tx, input: Scope & { invitationId: string }) {
  await tx.$queryRaw`SELECT "id" FROM "RetailOpsStaffInviteToken" WHERE "id"=${input.invitationId} AND "tenantId"=${input.tenantId} FOR UPDATE`
  const invitation = await tx.retailOpsStaffInviteToken.findFirst({
    where: { id: input.invitationId, tenantId: input.tenantId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      membershipId: true,
      invitedUserId: true,
    },
  })
  if (!invitation?.membershipId || !invitation.invitedUserId)
    throw new StaffInvitationCommandError(
      "NOT_FOUND",
      "Invitation is unavailable.",
    )
  await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id"=${invitation.membershipId} AND "tenantId"=${input.tenantId} FOR UPDATE`
  const membership = await tx.membership.findFirst({
    where: { id: invitation.membershipId, tenantId: input.tenantId },
    select: {
      id: true,
      userId: true,
      status: true,
      role: true,
      staffAccessRevision: true,
      catalogEditor: true,
      invitedAt: true,
      user: { select: { email: true, name: true, displayName: true } },
      retailOpsStaffProfile: { select: { id: true, defaultStoreId: true } },
      staffStoreAssignments: {
        where: {
          tenantId: input.tenantId,
          status: "ACTIVE",
          store: { tenantId: input.tenantId, status: "ACTIVE" },
        },
        select: {
          storeId: true,
          role: true,
          store: { select: { name: true } },
        },
      },
    },
  })
  if (
    !membership ||
    membership.userId !== invitation.invitedUserId ||
    membership.user.email !== invitation.email
  )
    throw new StaffInvitationCommandError(
      "NOT_FOUND",
      "Invitation membership is unavailable.",
    )
  return { invitation, membership }
}

/** Internal command review, with server scope; no email/token projection. */
export async function reviewStaffInvitationCommandInTransaction(
  tx: Tx,
  input: ReviewInput & Scope,
) {
  await assertStaffStoreAccessAuthority(tx, input)
  const parsed = staffInvitationCommandReviewInput.parse(
    input.kind === "INVITE"
      ? { kind: input.kind, invite: input.invite }
      : {
          kind: input.kind,
          invitationId: input.invitationId,
          reason: input.reason,
        },
  )
  if (parsed.kind === "INVITE") {
    const review = await reviewStaffInvitationInTransaction(tx, {
      ...parsed.invite,
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
    })
    const blockers = [...review.blockers]
    if (
      review.currentMembership &&
      review.currentMembership.status !== "REMOVED"
    )
      blockers.push({
        code: "STAFF_EXISTS",
        message:
          "This membership already exists. Use explicit resend for a pending invitation or the staff status/access workflow.",
      })
    const snapshot = {
      kind: parsed.kind,
      recipient: review.recipient,
      currentMembership: review.currentMembership,
      proposed: review.proposed,
      seats: review.seats,
      blockers,
    }
    return {
      ...snapshot,
      reviewHash: hash({ tenantId: input.tenantId, ...snapshot }),
      asOf: review.asOf,
    }
  }
  const current = await lifecycle(tx, {
    ...input,
    invitationId: parsed.invitationId,
  })
  const { invitation, membership } = current
  const blockers: Array<{ code: string; message: string }> = []
  if (!STAFF_STORE_ACCESS_ROLLOUT_READY)
    blockers.push({
      code: "STAFF_ROLLOUT_UNAVAILABLE",
      message: "Staff invitation commands are unavailable in this runtime.",
    })
  if (
    invitation.status !== "ACTIVE" ||
    invitation.acceptedAt ||
    membership.status !== "INVITED" ||
    membership.role !== invitation.role ||
    !["CASHIER", "OPERATOR", "MANAGER"].includes(membership.role)
  )
    blockers.push({
      code: "STAFF_INVITATION_CHANGED",
      message:
        "Only the exact unaccepted pending staff invitation can be resent or revoked.",
    })
  const defaultStoreId =
    membership.retailOpsStaffProfile?.defaultStoreId ?? null
  if (
    parsed.kind === "RESEND" &&
    (!defaultStoreId ||
      !membership.staffStoreAssignments.some(
        (a) => a.storeId === defaultStoreId,
      ))
  )
    blockers.push({
      code: "STAFF_ASSIGNMENTS_UNAVAILABLE",
      message: "A current assigned starting Store is required to resend.",
    })
  const snapshot = {
    kind: parsed.kind,
    invitationId: invitation.id,
    membershipId: membership.id,
    recipient: {
      email: invitation.email,
      name: membership.user.displayName || membership.user.name,
    },
    current: {
      role: membership.role,
      status: membership.status,
      accessRevision: membership.staffAccessRevision,
      invitationStatus: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      defaultStoreId,
      catalogEditor: membership.catalogEditor,
      assignments: membership.staffStoreAssignments
        .map((a) => ({
          storeId: a.storeId,
          role: a.role,
          storeName: a.store.name,
        }))
        .sort((a, b) => a.storeId.localeCompare(b.storeId)),
    },
    reason: parsed.reason,
    blockers,
    effect:
      parsed.kind === "RESEND"
        ? "Save a replacement invitation link and request one invitation email; previous links become invalid. Membership role and Store grants stay unchanged."
        : "Revoke this invitation link and cancel unsent notification work. Membership stays INVITED and still uses its staff seat; an email already sending may arrive with an invalid link.",
  }
  return {
    ...snapshot,
    reviewHash: hash({ tenantId: input.tenantId, ...snapshot }),
    asOf: new Date().toISOString(),
  }
}

export async function reviewStaffInvitationCommand(
  db: PrismaClient,
  input: ReviewInput & Scope,
) {
  return db.$transaction(
    (tx) => reviewStaffInvitationCommandInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** Acquire the command lock before lifecycle locks; returned command stays in this transaction. */
export async function prepareReviewedStaffInvitationCommandInTransaction(
  tx: Tx,
  input: ReviewInput & Scope,
  config: NodeJS.ProcessEnv = process.env,
) {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} AND "isActive"=true FOR UPDATE`
  const review = await reviewStaffInvitationCommandInTransaction(tx, input)
  if (review.blockers.length)
    throw new StaffInvitationCommandError(
      "CONFLICT",
      review.blockers.map((b) => b.message).join(" "),
    )
  return {
    review,
    execute: (clientCommandId: string) =>
      executeStaffInvitationCommandInTransaction(
        tx,
        { ...input, clientCommandId, expectedReviewHash: review.reviewHash },
        config,
      ),
  }
}

function savedReview(
  review: Awaited<ReturnType<typeof reviewStaffInvitationCommandInTransaction>>,
) {
  const invite = review.kind === "INVITE"
  return staffInvitationSavedReviewSchema.parse({
    recipient: review.recipient,
    membershipBefore: invite
      ? review.currentMembership
        ? {
            role: review.currentMembership.role,
            status: review.currentMembership.status,
            accessRevision: review.currentMembership.staffAccessRevision,
          }
        : null
      : {
          role: review.current.role,
          status: review.current.status,
          accessRevision: review.current.accessRevision,
        },
    grants: invite
      ? review.proposed
      : {
          role: review.current.role,
          status: "INVITED",
          defaultStoreId: review.current.defaultStoreId,
          catalogEditor: review.current.catalogEditor,
          assignments: review.current.assignments,
        },
    seats: invite ? review.seats : null,
    reason: invite ? null : review.reason,
    emailEffect:
      review.kind === "REVOKE"
        ? "CANCEL_UNSENT_WORK"
        : "REQUEST_INVITATION_EMAIL",
    reviewedAt: review.asOf,
    reviewHash: review.reviewHash,
  })
}

/** Atomic command + invitation + encrypted outbox. Does not enqueue or send. */
export async function executeStaffInvitationCommandInTransaction(
  tx: Tx,
  input: StaffInvitationCommandInput & Scope,
  config: NodeJS.ProcessEnv = process.env,
): Promise<StaffInvitationCommandReceipt> {
  const parsed = staffInvitationCommandInput.parse(
    input.kind === "INVITE"
      ? {
          kind: input.kind,
          invite: input.invite,
          clientCommandId: input.clientCommandId,
          expectedReviewHash: input.expectedReviewHash,
        }
      : {
          kind: input.kind,
          invitationId: input.invitationId,
          reason: input.reason,
          clientCommandId: input.clientCommandId,
          expectedReviewHash: input.expectedReviewHash,
        },
  )
  // Serialize invitations/seat reservation and command-key recovery across this business.
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} AND "isActive"=true FOR UPDATE`
  await assertStaffStoreAccessAuthority(tx, input)
  const payloadHash = hash({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    ...parsed,
  })
  const previous = await tx.staffInvitationCommand.findUnique({
    where: {
      tenantId_clientCommandId: {
        tenantId: input.tenantId,
        clientCommandId: parsed.clientCommandId,
      },
    },
  })
  if (previous) {
    if (
      previous.actorUserId !== input.actorUserId ||
      previous.payloadHash !== payloadHash ||
      previous.kind !== parsed.kind
    )
      throw new StaffInvitationCommandError(
        "CONFLICT",
        "Command key was already used for a different invitation request.",
      )
    return receiptSchema.parse(previous.result)
  }
  if (!STAFF_STORE_ACCESS_ROLLOUT_READY)
    throw new StaffInvitationCommandError(
      "PRECONDITION_FAILED",
      "Staff invitation commands are unavailable in this runtime.",
    )
  const review = await reviewStaffInvitationCommandInTransaction(tx, {
    ...parsed,
    ...input,
  })
  if (review.reviewHash !== parsed.expectedReviewHash)
    throw new StaffInvitationCommandError(
      "CONFLICT",
      "Invitation review changed. Review again before confirming.",
    )
  if (review.blockers.length)
    throw new StaffInvitationCommandError(
      "CONFLICT",
      review.blockers.map((b) => b.message).join(" "),
    )
  const commandId = randomUUID(),
    notificationId = parsed.kind === "REVOKE" ? null : randomUUID()
  let membershipId: string,
    invitationId: string,
    acceptanceToken: string | null = null
  if (parsed.kind === "INVITE") {
    assertStaffInvitationCustodyConfigured(config)
    const defaultRole = parsed.invite.assignments
      .find((a) => a.storeId === parsed.invite.defaultStoreId)!
      .role.toLowerCase() as "cashier" | "operator" | "manager"
    const saved = await inviteRetailOpsStaffInTransaction(tx, {
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
      storeId: parsed.invite.defaultStoreId,
      email: parsed.invite.email,
      name: parsed.invite.name,
      role: defaultRole,
      storeAccess: parsed.invite,
    })
    membershipId = saved.invite.id
    acceptanceToken = saved.invite.acceptanceToken
    if (!acceptanceToken)
      throw new StaffInvitationCommandError(
        "PRECONDITION_FAILED",
        "Durable invitation storage is unavailable.",
      )
    const tokenHash = createHash("sha256").update(acceptanceToken).digest("hex")
    const invitation = await tx.retailOpsStaffInviteToken.findUniqueOrThrow({
      where: { tokenHash },
      select: { id: true },
    })
    invitationId = invitation.id
  } else {
    const current = await lifecycle(tx, {
      ...input,
      invitationId: parsed.invitationId,
    })
    membershipId = current.membership.id
    invitationId = current.invitation.id
    // Revoke superseded unsent work. Sending/unknown work is never treated as safely unsent.
    await cancelStaffInvitationNotificationsInTransaction(tx, {
      tenantId: input.tenantId,
      invitationId,
    })
    if (parsed.kind === "RESEND") {
      assertStaffInvitationCustodyConfigured(config)
      acceptanceToken = await writeDurableRetailOpsStaffInvite(tx, {
        tenantId: input.tenantId,
        membershipId,
        invitedAt: new Date(),
        invitedByUserId: input.actorUserId,
        invitedUserId: current.membership.userId,
        email: current.invitation.email,
        role: current.membership.role,
        previousRole: current.membership.role,
        previousStatus: current.membership.status,
        staffDisplayName:
          current.membership.user.displayName || current.membership.user.name,
        storeId: current.membership.retailOpsStaffProfile!.defaultStoreId!,
      })
      if (!acceptanceToken)
        throw new StaffInvitationCommandError(
          "PRECONDITION_FAILED",
          "Durable invitation storage is unavailable.",
        )
      const tokenHash = createHash("sha256")
        .update(acceptanceToken)
        .digest("hex")
      invitationId = (
        await tx.retailOpsStaffInviteToken.findUniqueOrThrow({
          where: { tokenHash },
          select: { id: true },
        })
      ).id
    } else {
      const now = new Date()
      await tx.retailOpsStaffInviteToken.update({
        where: { id: invitationId },
        data: {
          status: "REVOKED",
          revokedAt: now,
          revokedByUserId: input.actorUserId,
        },
      })
      await tx.retailOpsStaffLifecycleEvent.create({
        data: {
          tenantId: input.tenantId,
          membershipId,
          staffUserId: current.membership.userId,
          actorUserId: input.actorUserId,
          staffProfileId: current.membership.retailOpsStaffProfile?.id,
          type: "INVITE_REVOKED",
          happenedAt: now,
          fromRole: current.membership.role,
          toRole: current.membership.role,
          fromStatus: current.membership.status,
          toStatus: current.membership.status,
          reason: parsed.reason,
          metadata: {
            source: "staff_invitation_command",
            commandId,
            invitationId,
          },
        },
      })
    }
  }
  const receipt = receiptSchema.parse({
    version: 1,
    commandId,
    kind: parsed.kind,
    membershipId,
    invitationId,
    notificationId,
    status: parsed.kind === "REVOKE" ? "revoked" : "saved",
    details: savedReview(review),
  })
  await tx.staffInvitationCommand.create({
    data: {
      id: commandId,
      tenantId: input.tenantId,
      clientCommandId: parsed.clientCommandId,
      kind: parsed.kind,
      payloadHash,
      actorUserId: input.actorUserId,
      membershipId,
      invitationId,
      result: receipt,
    },
  })
  if (notificationId && acceptanceToken) {
    const [tenant, actor, member] = await Promise.all([
      tx.tenant.findUniqueOrThrow({
        where: { id: input.tenantId },
        select: { name: true },
      }),
      tx.user.findUniqueOrThrow({
        where: { id: input.actorUserId },
        select: { name: true, displayName: true, email: true },
      }),
      tx.membership.findUniqueOrThrow({
        where: { id: membershipId },
        select: {
          role: true,
          staffAccessRevision: true,
          user: { select: { email: true, name: true, displayName: true } },
        },
      }),
    ])
    if (!(["CASHIER", "OPERATOR", "MANAGER"] as string[]).includes(member.role))
      throw Error("Unsupported invitation role")
    const links = buildStaffInvitationLinks(config, acceptanceToken)
    const payload = {
      version: 1 as const,
      ...links,
      businessName: tenant.name.slice(0, 500),
      invitedByName: (actor.displayName || actor.name || actor.email).slice(
        0,
        500,
      ),
      inviteeEmail: member.user.email,
      inviteeName: (member.user.displayName || member.user.name).slice(0, 120),
      membershipId,
      staffAccessRevision: member.staffAccessRevision,
      role: member.role as "CASHIER" | "OPERATOR" | "MANAGER",
    }
    const deliveryHash = staffInvitationPayloadHash(payload)
    const sealed = sealStaffInvitationPayload(
      payload,
      {
        tenantId: input.tenantId,
        membershipId,
        invitationId,
        notificationId,
        payloadHash: deliveryHash,
      },
      config,
    )
    await tx.staffInvitationNotification.create({
      data: {
        id: notificationId,
        tenantId: input.tenantId,
        commandId,
        membershipId,
        invitationId,
        payloadHash: deliveryHash,
        payloadCiphertext: sealed.envelope,
        encryptionKeyId: sealed.keyId,
      },
    })
  }
  return receipt
}

export async function executeStaffInvitationCommand(
  db: PrismaClient,
  input: StaffInvitationCommandInput & Scope,
  config: NodeJS.ProcessEnv = process.env,
) {
  return db.$transaction(
    (tx) => executeStaffInvitationCommandInTransaction(tx, input, config),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function getStaffInvitationCommandInTransaction(
  tx: Tx,
  input: Scope & { commandId: string },
) {
  await assertStaffStoreAccessAuthority(tx, input)
  const row = await tx.staffInvitationCommand.findFirst({
    where: { id: input.commandId, tenantId: input.tenantId },
    select: {
      result: true,
      createdAt: true,
      membership: {
        select: {
          id: true,
          role: true,
          status: true,
          staffAccessRevision: true,
          catalogEditor: true,
        },
      },
      invitation: {
        select: {
          status: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
      },
      notification: {
        select: {
          id: true,
          status: true,
          attemptCount: true,
          failureCode: true,
          sentAt: true,
          deliveredAt: true,
          cancelledAt: true,
        },
      },
    },
  })
  if (!row)
    throw new StaffInvitationCommandError(
      "NOT_FOUND",
      "Invitation command is unavailable.",
    )
  return {
    receipt: receiptSchema.parse(row.result),
    savedAt: row.createdAt.toISOString(),
    membership: row.membership,
    invitation: {
      ...row.invitation,
      status:
        row.invitation.status === "ACTIVE" &&
        row.invitation.expiresAt <= new Date()
          ? "EXPIRED"
          : row.invitation.status,
    },
    notification: row.notification,
  }
}
export async function getStaffInvitationCommand(
  db: PrismaClient,
  input: Scope & { commandId: string },
) {
  return db.$transaction(
    (tx) => getStaffInvitationCommandInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function listStaffInvitationsInTransaction(
  tx: Tx,
  input: Scope & { membershipId: string },
) {
  await assertStaffStoreAccessAuthority(tx, input)
  const member = await tx.membership.findFirst({
    where: { id: input.membershipId, tenantId: input.tenantId },
    select: { id: true },
  })
  if (!member)
    throw new StaffInvitationCommandError(
      "NOT_FOUND",
      "Staff membership is unavailable.",
    )
  const now = new Date(),
    where = { tenantId: input.tenantId, membershipId: member.id }
  const total = await tx.retailOpsStaffInviteToken.count({ where })
  const rows = await tx.retailOpsStaffInviteToken.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      sentAt: true,
      createdAt: true,
      notifications: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { status: true, commandId: true },
      },
    },
  })
  return {
    membershipId: member.id,
    total,
    limited: total > rows.length,
    asOf: now.toISOString(),
    data: rows.map(({ notifications, ...row }) => ({
      ...row,
      status:
        row.status === "ACTIVE" && row.expiresAt <= now
          ? "EXPIRED"
          : row.status,
      notificationStatus: notifications[0]?.status ?? "NOT_RECORDED",
      commandId: notifications[0]?.commandId ?? null,
    })),
  }
}
export async function listStaffInvitations(
  db: PrismaClient,
  input: Scope & { membershipId: string },
) {
  return db.$transaction((tx) => listStaffInvitationsInTransaction(tx, input), {
    isolationLevel: "RepeatableRead",
    maxWait: 10_000,
    timeout: 30_000,
  })
}
