import {
  type StaffMemberRow,
  getStaffRoleLabel,
  getStaffStatusLabel,
} from "@/lib/staff-management"
import { Badge } from "@ewatrade/ui"

/** Role and status keep the theme's rounded Badge in table, list and cards. */
export function StaffRoleBadge({ member }: { member: StaffMemberRow }) {
  return <Badge variant="secondary">{getStaffRoleLabel(member.role)}</Badge>
}

export function StaffStatusBadge({ member }: { member: StaffMemberRow }) {
  return (
    <Badge variant={member.status === "SUSPENDED" ? "destructive" : "outline"}>
      {getStaffStatusLabel(member.status)}
    </Badge>
  )
}
