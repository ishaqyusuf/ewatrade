import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  assertStaffStoreAccessAuthority,
  StaffStoreAccessError,
  type StaffStoreAccessInput,
  updateRetailOpsStaffStoreAccessInTransaction,
  validateStaffStoreAccess,
} from "./staff-store-access"

export type StaffAccessUpdateInput = StaffStoreAccessInput & {
  tenantId: string
  actorUserId: string
  storeId: string
  membershipId: string
  expectedRevision?: number
  confirmLegacyCutover: boolean
}

/** Fresh locked business review; no grants, invitations or work assignments change. */
export async function reviewStaffAccessUpdateInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffAccessUpdateInput,
) {
  return (
    await prepareStaffAccessUpdateInTransaction(tx, input, {
      requireLegacyConfirmation: false,
    })
  ).review
}

async function prepareStaffAccessUpdateInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffAccessUpdateInput,
  options: { requireLegacyConfirmation: boolean },
) {
  if (
    input.expectedRevision !== undefined &&
    (!Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1)
  )
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "Choose a valid access revision.",
    )
  if (typeof input.confirmLegacyCutover !== "boolean")
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "Review legacy cutover explicitly.",
    )
  const [tenant] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} AND "isActive"=true FOR UPDATE
  `
  if (!tenant)
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "This business is unavailable.",
    )
  await assertStaffStoreAccessAuthority(tx, input)
  const [target] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Membership" WHERE "id"=${input.membershipId}
      AND "tenantId"=${input.tenantId} FOR UPDATE
  `
  if (!target)
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "Staff member is unavailable in this business.",
    )
  const membership = await tx.membership.findFirstOrThrow({
    where: { id: target.id, tenantId: input.tenantId },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      staffAccessMode: true,
      staffAccessRevision: true,
      catalogEditor: true,
      retailOpsStaffProfile: { select: { defaultStoreId: true } },
      staffStoreAssignments: {
        where: { status: "ACTIVE" },
        orderBy: { storeId: "asc" },
        take: 101,
        select: { tenantId: true, storeId: true, role: true, revision: true },
      },
      user: { select: { name: true, displayName: true, email: true } },
    },
  })
  if (
    membership.userId === input.actorUserId ||
    !["CASHIER", "OPERATOR", "MANAGER"].includes(membership.role) ||
    !["INVITED", "ACTIVE", "SUSPENDED"].includes(membership.status)
  )
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "This staff membership cannot receive access changes.",
    )
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== membership.staffAccessRevision
  )
    throw new StaffStoreAccessError(
      "CONFLICT",
      "Staff access changed. Review again.",
    )
  if (
    options.requireLegacyConfirmation &&
    membership.staffAccessMode === "LEGACY" &&
    !input.confirmLegacyCutover
  )
    throw new StaffStoreAccessError(
      "CONFLICT",
      "Review and confirm replacing existing business-wide access.",
    )
  if (
    !membership.retailOpsStaffProfile ||
    membership.staffStoreAssignments.length > 100 ||
    membership.staffStoreAssignments.some(
      (row) => row.tenantId !== input.tenantId,
    )
  )
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "Current staff access cannot be reviewed safely.",
    )
  await validateStaffStoreAccess(tx, input)
  const assignments = input.assignments
    .map((row) => ({ storeId: row.storeId, role: row.role }))
    .sort((a, b) => a.storeId.localeCompare(b.storeId))
  const ids = [
    ...new Set([
      input.storeId,
      ...assignments.map((row) => row.storeId),
      ...membership.staffStoreAssignments.map((row) => row.storeId),
      ...(membership.retailOpsStaffProfile.defaultStoreId
        ? [membership.retailOpsStaffProfile.defaultStoreId]
        : []),
    ]),
  ].sort()
  const stores = await tx.$queryRaw<
    Array<{ id: string; name: string; status: string }>
  >`
    SELECT "id", "name", "status" FROM "Store" WHERE "tenantId"=${input.tenantId}
      AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR SHARE
  `
  if (
    !stores.some(
      (store) => store.id === input.storeId && store.status === "ACTIVE",
    ) ||
    assignments.some(
      (row) =>
        !stores.some(
          (store) => store.id === row.storeId && store.status === "ACTIVE",
        ),
    )
  )
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "A selected Store is unavailable in this business.",
    )
  const labels = new Map(stores.map((store) => [store.id, store]))
  const available = await tx.store.findMany({
    where: { tenantId: input.tenantId, status: "ACTIVE" },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 101,
    select: { id: true, name: true },
  })
  if (available.length > 100)
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "This business has more than 100 active Stores. The bounded access picker cannot show a complete set; review through the native access workflow.",
    )
  const before = {
    accessMode: membership.staffAccessMode,
    businessRole: membership.role,
    membershipStatus: membership.status,
    catalogEditor: membership.catalogEditor,
    defaultStoreId: membership.retailOpsStaffProfile.defaultStoreId,
    assignments: membership.staffStoreAssignments.map((row) => ({
      storeId: row.storeId,
      storeName: labels.get(row.storeId)?.name ?? null,
      storeStatus: labels.get(row.storeId)?.status ?? "UNAVAILABLE",
      role: row.role,
      revision: row.revision,
    })),
  }
  const after = {
    accessMode: "SCOPED" as const,
    businessRole: membership.role,
    membershipStatus: membership.status,
    catalogEditor: input.catalogEditor,
    defaultStoreId: input.defaultStoreId,
    assignments: assignments.map((row) => ({
      ...row,
      storeName: labels.get(row.storeId)!.name,
    })),
  }
  const review = {
    membershipId: membership.id,
    name: membership.user.displayName?.trim() || membership.user.name,
    email: membership.user.email,
    scope: "business_membership" as const,
    selectedStoreId: input.storeId,
    expectedRevision: membership.staffAccessRevision,
    availableStores: available,
    availableStoresCoverage: "complete" as const,
    requiresLegacyCutoverConfirmation: membership.staffAccessMode === "LEGACY",
    confirmLegacyCutover: input.confirmLegacyCutover,
    before,
    after,
    diff: {
      comparison:
        membership.staffAccessMode === "LEGACY"
          ? ("legacy_business_wide_not_enumerated" as const)
          : ("recorded_store_assignments" as const),
      added: after.assignments.filter(
        (row) => !before.assignments.some((old) => old.storeId === row.storeId),
      ),
      removed: before.assignments.filter(
        (row) =>
          !after.assignments.some((next) => next.storeId === row.storeId),
      ),
      changed: after.assignments.flatMap((row) => {
        const old = before.assignments.find(
          (previous) => previous.storeId === row.storeId,
        )
        return old && old.role !== row.role
          ? [
              {
                storeId: row.storeId,
                storeName: row.storeName,
                previousRole: old.role,
                nextRole: row.role,
              },
            ]
          : []
      }),
      catalog: { before: before.catalogEditor, after: after.catalogEditor },
      startingStore: {
        before: before.defaultStoreId,
        after: after.defaultStoreId,
      },
    },
    outstandingServiceWork: {
      coverage: "unavailable" as const,
      count: null,
      detail:
        "The canonical service queue reader requires a root client; no complete transaction-safe assignee read is available in this slice. Review work separately before reassignment.",
    },
    provenance: {
      reason: "not_recorded" as const,
      handover: "not_recorded" as const,
      businessRoleMutation: "unsupported" as const,
    },
    impact:
      "Replace Store access and starting Store; catalog editing remains a separate Manager-backed grant. Membership status and business role remain unchanged. No service reassignment or historical sales ownership changes.",
  }
  return {
    review: {
      ...review,
      reviewHash: createHash("sha256")
        .update(JSON.stringify(review))
        .digest("hex"),
    },
    command: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      staffUserId: membership.userId,
      expectedRevision: membership.staffAccessRevision,
      confirmLegacyCutover: input.confirmLegacyCutover,
      assignments,
      catalogEditor: input.catalogEditor,
      defaultStoreId: input.defaultStoreId,
    },
  }
}

/** Consume this only within the same transaction that holds the review locks. */
export async function prepareReviewedStaffAccessUpdateInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffAccessUpdateInput & { expectedRevision: number },
) {
  if (input.expectedRevision === undefined)
    throw new StaffStoreAccessError(
      "INVALID_INPUT",
      "Review the current access revision before confirming.",
    )
  const prepared = await prepareStaffAccessUpdateInTransaction(tx, input, {
    requireLegacyConfirmation: true,
  })
  let consumed = false
  return {
    review: prepared.review,
    execute: async () => {
      if (consumed)
        throw new StaffStoreAccessError(
          "CONFLICT",
          "This prepared access change was already consumed.",
        )
      consumed = true
      return updateRetailOpsStaffStoreAccessInTransaction(tx, prepared.command)
    },
  }
}

export function reviewStaffAccessUpdate(
  db: PrismaClient,
  input: StaffAccessUpdateInput,
) {
  return db.$transaction(
    (tx) => reviewStaffAccessUpdateInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}
export type StaffAccessUpdateReview = Awaited<
  ReturnType<typeof reviewStaffAccessUpdateInTransaction>
>
