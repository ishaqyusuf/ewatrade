import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { getRetailOpsSubscriptionSnapshot } from "./retail-ops-subscriptions"
import {
  StaffStoreAccessError,
  validateStaffStoreAccess,
} from "./staff-store-access"

export type StaffStatusChangeInput = {
  actorUserId: string
  tenantId: string
  status: "active" | "suspended"
  expectedRevision?: number
  reason?: string
} & (
  | { membershipId: string; staffUserId?: never }
  | {
      staffUserId: string
      membershipId?: never
    }
)

export function validateStaffStatusTransition(input: {
  actorUserId: string
  staffUserId: string
  role: string
  status: string
  nextStatus: "ACTIVE" | "SUSPENDED"
  acceptedAt: Date | null
  revision: number
  expectedRevision?: number
}) {
  if (input.actorUserId === input.staffUserId)
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "You cannot change your own staff status.",
    )
  if (
    !["CASHIER", "OPERATOR", "MANAGER"].includes(input.role) ||
    !["INVITED", "ACTIVE", "SUSPENDED"].includes(input.status)
  )
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "This membership cannot be changed by a staff status action.",
    )
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== input.revision
  )
    throw new StaffStoreAccessError(
      "CONFLICT",
      "Staff status or access changed. Refresh before saving.",
    )
  if (input.status === input.nextStatus)
    throw new StaffStoreAccessError(
      "CONFLICT",
      "This staff member already has that status.",
    )
  if (
    input.nextStatus === "ACTIVE" &&
    (input.status !== "SUSPENDED" || !input.acceptedAt)
  )
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "Only suspended staff who completed onboarding can be reactivated. An unaccepted invitation cannot be activated here.",
    )
}

async function assertStaffStatusAuthority(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; actorUserId: string },
) {
  const [actor] = await tx.$queryRaw<
    Array<{
      id: string
      status: string
      role: string
      staffAccessMode: string
    }>
  >`SELECT m."id", m."status", m."role", m."staffAccessMode" FROM "Membership" m
    JOIN "Tenant" t ON t."id"=m."tenantId" AND t."isActive"=true
    WHERE m."tenantId"=${input.tenantId} AND m."userId"=${input.actorUserId} FOR SHARE OF m`
  if (
    !actor ||
    actor.status !== "ACTIVE" ||
    !(
      actor.role === "OWNER" ||
      actor.role === "ADMIN" ||
      (actor.role === "MANAGER" && actor.staffAccessMode === "LEGACY")
    )
  )
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "Current business staff-management access is required.",
    )
  return actor
}

/** Serialize status with invitations, current actor authority and access changes. */
export async function prepareStaffStatusChangeInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffStatusChangeInput,
  options: { administrativeOnly?: boolean } = {},
) {
  const reason = input.reason?.trim() ?? null
  if (reason !== null && (!reason || reason.length > 500))
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "Enter a reason of 1–500 characters.",
    )
  if (
    input.expectedRevision !== undefined &&
    (!Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1)
  )
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "Choose a valid staff access revision.",
    )
  if (!["active", "suspended"].includes(input.status))
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "Choose active or suspended staff status.",
    )

  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} AND "isActive"=true FOR UPDATE`
  const actor = await assertStaffStatusAuthority(tx, input)
  if (options.administrativeOnly && !["OWNER", "ADMIN"].includes(actor.role))
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "Current Owner/Admin authority is required for assistant staff status changes.",
    )
  const target =
    input.membershipId !== undefined
      ? Prisma.sql`"id" = ${input.membershipId}`
      : Prisma.sql`"userId" = ${input.staffUserId}`
  const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Membership" WHERE "tenantId"=${input.tenantId} AND ${target}
    AND "role" IN ('CASHIER', 'OPERATOR', 'MANAGER') FOR UPDATE
  `
  if (!locked)
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "Staff member is unavailable in this business.",
    )
  const membership = await tx.membership.findFirstOrThrow({
    where: { id: locked.id, tenantId: input.tenantId },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      acceptedAt: true,
      invitedAt: true,
      staffAccessMode: true,
      staffAccessRevision: true,
      catalogEditor: true,
      retailOpsStaffProfile: { select: { defaultStoreId: true } },
      staffStoreAssignments: {
        where: { status: "ACTIVE" },
        orderBy: { storeId: "asc" },
        select: {
          tenantId: true,
          storeId: true,
          role: true,
          revision: true,
        },
      },
      user: {
        select: { id: true, name: true, displayName: true, email: true },
      },
    },
  })
  const nextStatus: "ACTIVE" | "SUSPENDED" =
    input.status === "active" ? "ACTIVE" : "SUSPENDED"
  validateStaffStatusTransition({
    actorUserId: input.actorUserId,
    staffUserId: membership.userId,
    role: membership.role,
    status: membership.status,
    nextStatus,
    acceptedAt: membership.acceptedAt,
    revision: membership.staffAccessRevision,
    expectedRevision: input.expectedRevision,
  })
  const assignments = membership.staffStoreAssignments
  const stores = assignments.length
    ? await tx.$queryRaw<
        Array<{
          id: string
          name: string
          status: string
        }>
      >`SELECT "id", "name", "status" FROM "Store" WHERE "tenantId"=${input.tenantId}
    AND "id" IN (${Prisma.join(assignments.map((row) => row.storeId))}) ORDER BY "id" FOR SHARE`
    : []
  const currentAssignments = assignments.map((row) => ({
    ...row,
    storeName:
      stores.find((store) => store.id === row.storeId)?.name ??
      "Unavailable Store",
    storeStatus:
      stores.find((store) => store.id === row.storeId)?.status ?? "UNAVAILABLE",
  }))
  if (nextStatus === "ACTIVE") {
    if (membership.staffAccessMode === "SCOPED") {
      if (
        !assignments.length ||
        currentAssignments.some(
          (row) =>
            row.tenantId !== input.tenantId || row.storeStatus !== "ACTIVE",
        )
      )
        throw new StaffStoreAccessError(
          "INVALID_INPUT",
          "Current Store assignments are unavailable. Review staff access before reactivation.",
        )
      await validateStaffStoreAccess(tx, {
        tenantId: input.tenantId,
        assignments,
        defaultStoreId:
          membership.retailOpsStaffProfile?.defaultStoreId ?? null,
        catalogEditor: membership.catalogEditor,
      })
    }
    const subscription = await getRetailOpsSubscriptionSnapshot(tx, {
      tenantId: input.tenantId,
    })
    const staff = subscription.entitlements.find((row) => row.key === "staff")
    if (!staff) throw new Error("Staff entitlement is unavailable.")
    // Suspended memberships already consume a seat; equality does not add one.
    if (staff.limit !== null && staff.used > staff.limit)
      throw new StaffStoreAccessError(
        "INVALID_INPUT",
        "The current plan staff limit must be resolved before reactivation.",
      )
  }
  return {
    actorMembershipId: actor.id,
    membership,
    assignments: currentAssignments,
    nextStatus,
    reason,
  }
}

export function staffStatusChangeReviewFromPrepared(
  prepared: Awaited<ReturnType<typeof prepareStaffStatusChangeInTransaction>>,
) {
  const { membership, nextStatus, reason } = prepared
  const review = {
    membershipId: membership.id,
    name: membership.user.displayName?.trim() || membership.user.name,
    email: membership.user.email,
    role: membership.role,
    previousStatus: membership.status,
    nextStatus,
    acceptedAt: membership.acceptedAt?.toISOString() ?? null,
    expectedRevision: membership.staffAccessRevision,
    accessMode: membership.staffAccessMode,
    catalogEditor: membership.catalogEditor,
    defaultStoreId: membership.retailOpsStaffProfile?.defaultStoreId ?? null,
    assignments: prepared.assignments.map((row) => ({
      storeId: row.storeId,
      storeName: row.storeName,
      storeStatus: row.storeStatus,
      role: row.role,
      revision: row.revision,
    })),
    reason,
    scope: "business_membership" as const,
    impact:
      nextStatus === "SUSPENDED"
        ? "Suspend access to this whole business, including new requests, outstanding confirmations and offline replay. Existing orders, jobs and history stay recorded. Assigned conversations are released to the Store queue."
        : "Reactivate this business membership using its current access only. Removed Store grants are not restored. Existing orders, jobs and history keep their original ownership.",
  }
  return {
    ...review,
    reviewHash: createHash("sha256")
      .update(JSON.stringify(review))
      .digest("hex"),
  }
}

export async function reviewStaffStatusChangeInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffStatusChangeInput,
  options: { administrativeOnly?: boolean } = {},
) {
  return staffStatusChangeReviewFromPrepared(
    await prepareStaffStatusChangeInTransaction(tx, input, options),
  )
}

export async function reviewStaffStatusChange(
  db: PrismaClient,
  input: StaffStatusChangeInput,
  options: { administrativeOnly?: boolean } = {},
) {
  return db.$transaction(
    (tx) => reviewStaffStatusChangeInTransaction(tx, input, options),
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}
