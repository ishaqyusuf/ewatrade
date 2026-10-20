"use client"
import { getStaffRoleLabel, getStaffStatusLabel } from "@/lib/staff-management"
import { staffDirectoryTargetSchema } from "@ewatrade/assistant/general/contracts"
import { Button, Input, Select } from "@ewatrade/ui"

type Target = ReturnType<typeof staffDirectoryTargetSchema.parse>
const roles =
  staffDirectoryTargetSchema.shape.filters.shape.role.unwrap().options
const statuses =
  staffDirectoryTargetSchema.shape.filters.shape.status.unwrap().options

export function StaffDirectorySheetHeader({
  filters,
  disabled,
  onApply,
}: {
  filters: Target["filters"]
  disabled: boolean
  onApply: (target: Target) => void
}) {
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        onApply(
          staffDirectoryTargetSchema.parse({
            kind: "staff_directory",
            filters: {
              ...filters,
              cursor: undefined,
              search: String(data.get("search") ?? "").trim() || undefined,
              role: data.get("role") || undefined,
              status: data.get("status") || undefined,
            },
          }),
        )
      }}
    >
      <Input
        name="search"
        aria-label="Search staff by name or email"
        placeholder="Search by name or email"
        defaultValue={filters.search ?? ""}
        maxLength={120}
        disabled={disabled}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          name="role"
          aria-label="Staff role"
          defaultValue={filters.role ?? ""}
          disabled={disabled}
        >
          <option value="">All roles</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {getStaffRoleLabel(role)}
            </option>
          ))}
        </Select>
        <Select
          name="status"
          aria-label="Membership status"
          defaultValue={filters.status ?? ""}
          disabled={disabled}
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {getStaffStatusLabel(status)}
            </option>
          ))}
        </Select>
      </div>
      {filters.assignmentStoreId ? (
        <p className="text-xs text-muted-foreground">
          Only staff assigned to one store.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={disabled}>
          Apply
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onApply({ kind: "staff_directory", filters: {} })}
        >
          Clear all
        </Button>
      </div>
    </form>
  )
}
