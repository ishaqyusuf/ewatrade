"use client"
import type { TableColumnMeta } from "@/components/tables/core"
import {
  type StaffMemberRow,
  getStaffDisplayName,
  getStaffWorkingRole,
  getStaffWorkingRoleLabel,
} from "@/lib/staff-management"
import { Checkbox } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"
import { StaffActionsMenu, type StaffRowActions } from "./actions"
import {
  StaffAvatar,
  StaffJoined,
  StaffName,
  StaffRoleBadge,
  StaffStatus,
  staffStoresText,
} from "./format"

const ROLE_RANK: Record<string, number> = {
  OWNER: 0,
  ADMIN: 1,
  MANAGER: 2,
  CASHIER: 3,
  OPERATOR: 4,
}

export function staffColumns(
  actions: StaffRowActions,
): ColumnDef<StaffMemberRow>[] {
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
      header: "Name",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex max-w-72 min-w-48 items-center gap-3">
          <StaffAvatar member={row.original} />
          <div className="grid min-w-0">
            <StaffName member={row.original} onOpen={actions.onOpen} />
            <span className="truncate text-sm text-muted-foreground">
              {row.original.user.email}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "role",
      accessorFn: (row) => getStaffWorkingRoleLabel(row),
      header: "Role",
      sortingFn: (a, b) =>
        (ROLE_RANK[getStaffWorkingRole(a.original) ?? ""] ?? 9) -
        (ROLE_RANK[getStaffWorkingRole(b.original) ?? ""] ?? 9),
      cell: ({ row }) => <StaffRoleBadge member={row.original} />,
    },
    {
      id: "stores",
      accessorFn: (row) => staffStoresText(row),
      header: "Stores",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {staffStoresText(row.original)}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      header: "Status",
      cell: ({ row }) => <StaffStatus member={row.original} />,
    },
    {
      id: "invitedAt",
      accessorFn: (row) => row.acceptedAt ?? row.invitedAt ?? "",
      header: "Joined",
      meta: { headerLabel: "Joined" } satisfies TableColumnMeta,
      cell: ({ row }) => <StaffJoined member={row.original} />,
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <StaffActionsMenu member={row.original} actions={actions} />
      ),
    },
  ]
}
