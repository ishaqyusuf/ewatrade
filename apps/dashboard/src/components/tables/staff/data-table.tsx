"use client"

import { staffSortFields } from "@/components/tables/staff/sort"
import { useSortParams } from "@/hooks/use-sort-params"
import { useStaffParams } from "@/hooks/use-staff-params"
import type { StaffMemberRow } from "@/lib/staff-management"
import {
  canUpdateStaffStatus,
  getNextStaffStatus,
  getStaffDisplayName,
  getStaffRoleLabel,
  getStaffStatusLabel,
} from "@/lib/staff-management"
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { type ColumnDef, flexRender } from "@tanstack/react-table"
import { useMemo } from "react"

function tone(value: string) {
  const normalized = value.toUpperCase()
  if (normalized === "ACTIVE") return "bg-emerald-50 text-emerald-700"
  if (normalized === "INVITED") return "bg-amber-50 text-amber-700"
  if (normalized === "SUSPENDED") return "bg-destructive/10 text-destructive"
  if (normalized === "OWNER" || normalized === "ADMIN")
    return "bg-primary/10 text-primary"
  if (normalized === "MANAGER") return "bg-sky-50 text-sky-700"
  return "bg-muted text-muted-foreground"
}

function formatDate(value: string | null) {
  if (!value) return "Not yet"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date)
}

export function StaffDataTable({
  rows,
  isLoading,
  updatingId,
  onUpdateStatus,
}: {
  rows: StaffMemberRow[]
  isLoading: boolean
  updatingId: string | null
  onUpdateStatus: (staff: StaffMemberRow) => void
}) {
  const { setAccessUserId } = useStaffParams()
  const { sort, sorting, toggleSort } = useSortParams({
    fields: staffSortFields,
  })
  const columns = useMemo<ColumnDef<StaffMemberRow>[]>(
    () => [
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
          <Badge className={`rounded-full ${tone(row.original.role)}`}>
            {getStaffRoleLabel(row.original.role)}
          </Badge>
        ),
      },
      {
        id: "status",
        accessorFn: (row) => row.status,
        header: "Status",
        cell: ({ row }) => (
          <Badge className={`rounded-full ${tone(row.original.status)}`}>
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
        cell: ({ row }) => {
          const member = row.original
          const nextStatus = getNextStaffStatus(member)
          const isUpdating = updatingId === member.user.id
          return (
            <div className="flex gap-1">
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
                className="gap-2 rounded-none"
                disabled={!canUpdateStaffStatus(member) || isUpdating}
                onClick={() => onUpdateStatus(member)}
              >
                {isUpdating
                  ? "Saving"
                  : nextStatus === "active"
                    ? "Reactivate"
                    : "Suspend"}
              </Button>
            </div>
          )
        },
      },
    ],
    [onUpdateStatus, updatingId, setAccessUserId],
  )
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  })

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {rows.length} staff members{isLoading ? " · Updating…" : ""}
        {sort ? ` · sorted by ${sort.field} ${sort.direction}` : ""}
      </p>
      <div className="overflow-x-auto border border-border">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              {table.getFlatHeaders().map((header) => {
                const id = header.column.id
                const field = staffSortFields.find(
                  (candidate) => candidate === id,
                )
                const direction =
                  field && sort?.field === field ? sort.direction : undefined
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    aria-sort={
                      field
                        ? direction === "asc"
                          ? "ascending"
                          : direction === "desc"
                            ? "descending"
                            : "none"
                        : undefined
                    }
                  >
                    {field ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto rounded-none p-0 font-normal hover:bg-transparent"
                        aria-label={`Sort by ${String(header.column.columnDef.header)}${direction ? `, currently ${direction}` : ""}`}
                        onClick={() => void toggleSort(field)}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {direction === "asc"
                          ? " ↑"
                          : direction === "desc"
                            ? " ↓"
                            : ""}
                      </Button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No staff found. Invite a staff member or adjust the current
                  filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
