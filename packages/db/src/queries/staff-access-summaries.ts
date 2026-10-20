import type { PrismaClient } from "../../generated/prisma/client"

export type StaffAccessSummary = {
  membershipId: string
  /** Owners, admins and legacy-mode staff can use every Store. */
  allStores: boolean
  catalogEditor: boolean
  defaultStoreId: string | null
  stores: Array<{ storeId: string; storeName: string; role: string }>
  /** Latest unaccepted, unrevoked invitation link, if any. */
  invitation: { id: string; expiresAt: Date } | null
}

/** Store access and pending invitation for the Staff page rows of one business. */
export async function listStaffAccessSummaries(
  db: PrismaClient,
  input: { tenantId: string; membershipIds: string[] },
): Promise<StaffAccessSummary[]> {
  if (!input.membershipIds.length) return []
  const memberships = await db.membership.findMany({
    where: { tenantId: input.tenantId, id: { in: input.membershipIds } },
    select: {
      id: true,
      role: true,
      staffAccessMode: true,
      catalogEditor: true,
      retailOpsStaffProfile: { select: { defaultStoreId: true } },
      staffStoreAssignments: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: {
          storeId: true,
          role: true,
          store: { select: { name: true } },
        },
      },
      retailOpsStaffInviteTokens: {
        where: { status: "ACTIVE", acceptedAt: null, revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, expiresAt: true },
      },
    },
  })
  return memberships.map((membership) => ({
    membershipId: membership.id,
    allStores:
      membership.role === "OWNER" ||
      membership.role === "ADMIN" ||
      membership.staffAccessMode === "LEGACY",
    catalogEditor: membership.catalogEditor,
    defaultStoreId: membership.retailOpsStaffProfile?.defaultStoreId ?? null,
    stores: membership.staffStoreAssignments.map((assignment) => ({
      storeId: assignment.storeId,
      storeName: assignment.store.name,
      role: assignment.role,
    })),
    invitation: membership.retailOpsStaffInviteTokens[0] ?? null,
  }))
}
