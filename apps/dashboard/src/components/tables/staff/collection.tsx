"use client"

import {
  type CollectionView,
  DirectoryCollection,
  DirectoryRecord,
} from "@/components/tables/core"
import {
  type StaffMemberRow,
  getStaffDisplayName,
} from "@/lib/staff-management"
import type { Row } from "@tanstack/react-table"
import { StaffActions, type StaffActionsProps } from "./actions"
import { StaffRoleBadge, StaffStatusBadge } from "./badges"
import { formatStaffDate } from "./format"

export function StaffCollection({
  rows,
  view,
  ...actions
}: Omit<StaffActionsProps, "member"> & {
  rows: Row<StaffMemberRow>[]
  view: CollectionView
}) {
  return (
    <DirectoryCollection view={view} label="Staff">
      {rows.map((row) => {
        const member = row.original
        const name = getStaffDisplayName(member)
        return (
          <DirectoryRecord
            key={row.id}
            row={row}
            view={view}
            selectLabel={`Select ${name}`}
            title={name}
            description={member.user.email}
            badges={
              <>
                <StaffRoleBadge member={member} />
                <StaffStatusBadge member={member} />
              </>
            }
            details={[
              { label: "Invited", value: formatStaffDate(member.invitedAt) },
              { label: "Accepted", value: formatStaffDate(member.acceptedAt) },
            ]}
            actions={<StaffActions member={member} {...actions} />}
          />
        )
      })}
    </DirectoryCollection>
  )
}
