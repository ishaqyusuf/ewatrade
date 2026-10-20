import type {
  StaffMemberRow,
  StaffRoleFilter,
  StaffStatusFilter,
} from "@/lib/staff-management"
import { prisma } from "@ewatrade/db"
import {
  listRetailOpsStaff,
  listStaffAccessSummaries,
} from "@ewatrade/db/queries"

function serializeStaffDate(value: Date | null) {
  return value?.toISOString() ?? null
}

export async function getDashboardStaff(input: {
  role?: StaffRoleFilter
  search?: string
  status?: StaffStatusFilter
  tenantId: string
}) {
  const staff = await listRetailOpsStaff(prisma, {
    all: true,
    role: input.role,
    search: input.search,
    status: input.status,
    tenantId: input.tenantId,
  })

  const summaries = new Map(
    (
      await listStaffAccessSummaries(prisma, {
        tenantId: input.tenantId,
        membershipIds: staff.map((member) => member.id),
      })
    ).map((summary) => [summary.membershipId, summary]),
  )

  return staff.map((member) => {
    const summary = summaries.get(member.id)
    return {
      ...member,
      access: summary
        ? {
            allStores: summary.allStores,
            catalogEditor: summary.catalogEditor,
            defaultStoreId: summary.defaultStoreId,
            stores: summary.stores,
            invitationId: summary.invitation?.id ?? null,
            invitationExpiresAt:
              summary.invitation?.expiresAt.toISOString() ?? null,
          }
        : undefined,
      acceptedAt: serializeStaffDate(member.acceptedAt),
      createdAt: member.createdAt.toISOString(),
      invitedAt: serializeStaffDate(member.invitedAt),
      updatedAt: member.updatedAt.toISOString(),
    } satisfies StaffMemberRow
  })
}
