"use client"
import { useStaffParams } from "@/hooks/use-staff-params"
import {
  type StaffMemberRow,
  canUpdateStaffStatus,
  getNextStaffStatus,
} from "@/lib/staff-management"
import { Button } from "@ewatrade/ui"

export type StaffActionsProps = {
  member: StaffMemberRow
  updatingId: string | null
  onUpdateStatus: (staff: StaffMemberRow) => void
}
export function StaffActions({
  member,
  updatingId,
  onUpdateStatus,
}: StaffActionsProps) {
  const { setAccessUserId } = useStaffParams()
  const isUpdating = updatingId === member.user.id
  return (
    <div className="flex flex-wrap gap-1">
      {canUpdateStaffStatus(member) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void setAccessUserId(member.user.id)}
        >
          Manage access
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!canUpdateStaffStatus(member) || isUpdating}
        onClick={() => onUpdateStatus(member)}
      >
        {isUpdating
          ? "Saving"
          : getNextStaffStatus(member) === "active"
            ? "Reactivate"
            : "Suspend"}
      </Button>
    </div>
  )
}
