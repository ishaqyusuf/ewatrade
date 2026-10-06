import type {
  Prisma,
  PrismaClient,
  StoreStaffRole,
} from "../../generated/prisma/client"
import type { DbClient } from "./types"

// Local acceptance is enabled after central enforcement and schema verification.
// Hosted Preview/Production remain gated until client and signup acceptance.
export const STAFF_STORE_ACCESS_ROLLOUT_READY =
  ["local", "dev", "preview"].includes(process.env.APP_ENV ?? "") &&
  process.env.NODE_ENV === "development"

export async function readStaffStoreAccess(
  db: DbClient,
  membershipId: string,
  tenantId: string,
) {
  return db.membership.findFirst({
    where: {
      id: membershipId,
      tenantId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: {
      role: true,
      status: true,
      staffAccessMode: true,
      catalogEditor: true,
      staffAccessRevision: true,
      retailOpsStaffProfile: { select: { defaultStoreId: true } },
      staffStoreAssignments: {
        where: {
          tenantId,
          status: "ACTIVE",
          store: { tenantId, status: "ACTIVE" },
        },
        select: { storeId: true, role: true, status: true, revision: true },
      },
    },
  })
}

export type StaffStoreAccessInput = {
  assignments: Array<{ storeId: string; role: StoreStaffRole }>
  catalogEditor: boolean
  defaultStoreId: string | null
}

export class StaffStoreAccessError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "CONFLICT" | "INVALID_INPUT",
    message: string,
  ) {
    super(message)
    this.name = "StaffStoreAccessError"
  }
}

/** Validate and write authority inside the caller's transaction, before sending an invite. */
export async function setStaffStoreAccess(
  tx: Prisma.TransactionClient,
  input: StaffStoreAccessInput & {
    tenantId: string
    membershipId: string
    actorUserId: string
    expectedRevision: number
  },
) {
  const [actor] = await tx.$queryRaw<
    Array<{ id: string; status: string; role: string }>
  >`
    SELECT "id", "status", "role" FROM "Membership"
    WHERE "tenantId" = ${input.tenantId} AND "userId" = ${input.actorUserId}
    FOR SHARE
  `
  if (
    !actor ||
    actor.status !== "ACTIVE" ||
    !["OWNER", "ADMIN"].includes(actor.role)
  ) {
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "Only Owner/Admin can assign Store access.",
    )
  }
  const ids = input.assignments.map((row) => row.storeId)
  if (
    ids.length > 100 ||
    new Set(ids).size !== ids.length ||
    (ids.length
      ? !input.defaultStoreId || !ids.includes(input.defaultStoreId)
      : input.defaultStoreId !== null) ||
    input.assignments.some(
      (row) => !["CASHIER", "OPERATOR", "MANAGER"].includes(row.role),
    ) ||
    (input.catalogEditor &&
      !input.assignments.some((row) => row.role === "MANAGER"))
  ) {
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "Choose distinct Stores, a role for each, and a default from those Stores. Catalog editing requires Manager access.",
    )
  }
  const stores = await tx.store.count({
    where: { id: { in: ids }, tenantId: input.tenantId, status: "ACTIVE" },
  })
  if (stores !== ids.length)
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "A selected Store is unavailable for this business.",
    )
  await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${input.membershipId} AND "tenantId" = ${input.tenantId} FOR UPDATE`
  const membership = await tx.membership.findFirst({
    where: { id: input.membershipId, tenantId: input.tenantId },
    include: {
      staffStoreAssignments: true,
      retailOpsStaffProfile: { select: { defaultStoreId: true } },
    },
  })
  if (
    !membership ||
    !["INVITED", "ACTIVE", "SUSPENDED"].includes(membership.status) ||
    ["OWNER", "ADMIN", "SUPPORT", "MEMBER"].includes(membership.role)
  ) {
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "This membership cannot receive Store staff assignments.",
    )
  }
  const changed = await tx.membership.updateMany({
    where: {
      id: membership.id,
      tenantId: input.tenantId,
      staffAccessRevision: input.expectedRevision,
    },
    data: {
      staffAccessMode: "SCOPED",
      catalogEditor: input.catalogEditor,
      staffAccessRevision: { increment: 1 },
    },
  })
  if (changed.count !== 1)
    throw new StaffStoreAccessError(
      "CONFLICT",
      "Staff access changed. Refresh before saving.",
    )
  await tx.staffStoreAssignment.updateMany({
    where: {
      membershipId: membership.id,
      storeId: { notIn: ids },
      status: { not: "REVOKED" },
    },
    data: {
      status: "REVOKED",
      revision: { increment: 1 },
      updatedByUserId: input.actorUserId,
    },
  })
  for (const row of input.assignments) {
    await tx.staffStoreAssignment.upsert({
      where: {
        membershipId_storeId: {
          membershipId: membership.id,
          storeId: row.storeId,
        },
      },
      create: {
        ...row,
        tenantId: input.tenantId,
        membershipId: membership.id,
        updatedByUserId: input.actorUserId,
      },
      update: {
        role: row.role,
        status: "ACTIVE",
        revision: { increment: 1 },
        updatedByUserId: input.actorUserId,
      },
    })
  }
  await tx.retailOpsStaffProfile.updateMany({
    where: { membershipId: membership.id },
    data: { defaultStoreId: input.defaultStoreId },
  })
  await tx.staffAccessAuditEvent.create({
    data: {
      tenantId: input.tenantId,
      membershipId: membership.id,
      actorUserId: input.actorUserId,
      operation:
        membership.staffAccessMode === "LEGACY"
          ? "scoped_access_confirmed"
          : "access_changed",
      revision: input.expectedRevision + 1,
      before: {
        mode: membership.staffAccessMode,
        businessRole: membership.role,
        membershipStatus: membership.status,
        defaultStoreId:
          membership.retailOpsStaffProfile?.defaultStoreId ?? null,
        catalogEditor: membership.catalogEditor,
        assignments: membership.staffStoreAssignments.map((row) => ({
          storeId: row.storeId,
          role: row.role,
          status: row.status,
        })),
      },
      after: {
        mode: "SCOPED",
        assignments: input.assignments,
        catalogEditor: input.catalogEditor,
        defaultStoreId: input.defaultStoreId,
      },
    },
  })
}

export async function updateRetailOpsStaffStoreAccess(
  db: PrismaClient,
  input: StaffStoreAccessInput & {
    tenantId: string
    staffUserId: string
    actorUserId: string
    expectedRevision: number
    confirmLegacyCutover?: boolean
  },
) {
  return db.$transaction(
    async (tx) => {
      const membership = await tx.membership.findUnique({
        where: {
          tenantId_userId: {
            tenantId: input.tenantId,
            userId: input.staffUserId,
          },
        },
        select: { id: true, staffAccessMode: true },
      })
      if (!membership)
        throw new StaffStoreAccessError(
          "INVALID_INPUT",
          "Staff membership not found.",
        )
      if (
        membership.staffAccessMode === "LEGACY" &&
        !input.confirmLegacyCutover
      ) {
        throw new StaffStoreAccessError(
          "CONFLICT",
          "Review and confirm the replacement of existing business-wide access before switching this person to selected Stores.",
        )
      }
      await setStaffStoreAccess(tx, { ...input, membershipId: membership.id })
      return {
        membershipId: membership.id,
        revision: input.expectedRevision + 1,
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
