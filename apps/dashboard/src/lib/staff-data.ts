import type {
  StaffMemberRow,
  StaffRoleFilter,
  StaffStatusFilter,
} from "@/lib/staff-management"
import { prisma } from "@ewatrade/db"
import { listRetailOpsStaff } from "@ewatrade/db/queries"

function serializeStaffDate(value: Date | null) {
  return value?.toISOString() ?? null
}

export async function getDashboardStaff(input: {
  limit?: number
  role?: StaffRoleFilter
  search?: string
  status?: StaffStatusFilter
  tenantId: string
}) {
  const staff = await listRetailOpsStaff(prisma, {
    limit: input.limit ?? 75,
    role: input.role,
    search: input.search,
    status: input.status,
    tenantId: input.tenantId,
  })

  return staff.map(
    (member) =>
      ({
        ...member,
        acceptedAt: serializeStaffDate(member.acceptedAt),
        createdAt: member.createdAt.toISOString(),
        invitedAt: serializeStaffDate(member.invitedAt),
        updatedAt: member.updatedAt.toISOString(),
      }) satisfies StaffMemberRow,
  )
}
