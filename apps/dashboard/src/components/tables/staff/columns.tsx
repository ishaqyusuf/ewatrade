"use client"
import { selectColumn } from "@/components/tables/core"
import {
  type StaffMemberRow,
  getStaffDisplayName,
  getStaffRoleLabel,
} from "@/lib/staff-management"
import type { ColumnDef } from "@tanstack/react-table"
import { StaffActions, type StaffActionsProps } from "./actions"
import { StaffRoleBadge, StaffStatusBadge } from "./badges"
import { formatStaffDate as formatDate } from "./format"

export function staffColumns({
  updatingId,
  onUpdateStatus,
}: Omit<StaffActionsProps, "member">): ColumnDef<StaffMemberRow>[] {
  return [
    selectColumn(getStaffDisplayName, "Select all staff"),
    {
      id: "name",
      accessorFn: getStaffDisplayName,
      header: "Staff",
      cell: ({ row }) => (
        <div className="min-w-48">
          <p className="font-medium">{getStaffDisplayName(row.original)}</p>
          <p className="text-sm text-muted-foreground">
            {row.original.user.email}
          </p>
        </div>
      ),
    },
    {
      id: "role",
      accessorFn: (row) => getStaffRoleLabel(row.role),
      header: "Role",
      cell: ({ row }) => <StaffRoleBadge member={row.original} />,
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      header: "Status",
      cell: ({ row }) => <StaffStatusBadge member={row.original} />,
    },
    {
      id: "invitedAt",
      accessorKey: "invitedAt",
      header: "Invited",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground tabular-nums">
          {formatDate(row.original.invitedAt)}
        </span>
      ),
    },
    {
      id: "acceptedAt",
      accessorKey: "acceptedAt",
      header: "Accepted",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground tabular-nums">
          {formatDate(row.original.acceptedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      header: "Actions",
      meta: { align: "end" },
      cell: ({ row }) => (
        <div className="flex justify-end">
          <StaffActions
            member={row.original}
            updatingId={updatingId}
            onUpdateStatus={onUpdateStatus}
          />
        </div>
      ),
    },
  ]
}
