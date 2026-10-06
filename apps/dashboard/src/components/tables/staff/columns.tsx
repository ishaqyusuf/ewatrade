"use client"
import {
  type StaffMemberRow,
  getStaffDisplayName,
  getStaffRoleLabel,
  getStaffStatusLabel,
} from "@/lib/staff-management"
import { Badge, Checkbox } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"
import { StaffActions, type StaffActionsProps } from "./actions"
import { formatStaffDate as formatDate } from "./format"

export function staffColumns({
  updatingId,
  onUpdateStatus,
}: Omit<StaffActionsProps, "member">): ColumnDef<StaffMemberRow>[] {
  return [
    {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all staff"
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          disabled={!table.getRowModel().rows.some((row) => row.getCanSelect())}
          onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${getStaffDisplayName(row.original)}`}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
        />
      ),
    },
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
      cell: ({ row }) => (
        <Badge variant="secondary">
          {getStaffRoleLabel(row.original.role)}
        </Badge>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "SUSPENDED" ? "destructive" : "outline"
          }
        >
          {getStaffStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      id: "invitedAt",
      accessorKey: "invitedAt",
      header: "Invited",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.invitedAt)}
        </span>
      ),
    },
    {
      id: "acceptedAt",
      accessorKey: "acceptedAt",
      header: "Accepted",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.acceptedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      header: "Actions",
      cell: ({ row }) => (
        <StaffActions
          member={row.original}
          updatingId={updatingId}
          onUpdateStatus={onUpdateStatus}
        />
      ),
    },
  ]
}
