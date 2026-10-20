"use client"
import { TableToolbarPortal, getHeaderLabel } from "@/components/tables/core"
import { useSortParams } from "@/hooks/use-sort-params"
import type { StaffMemberRow } from "@/lib/staff-management"
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { type Table, flexRender } from "@tanstack/react-table"
import { staffSortFields } from "./sort"
type StaffSort = ReturnType<typeof useSortParams<typeof staffSortFields>>
export function StaffTableHeader({
  table,
  sort,
  toggleSort,
}: {
  table: Table<StaffMemberRow>
  sort: StaffSort["sort"]
  toggleSort: StaffSort["toggleSort"]
}) {
  return (
    <TableHeader>
      <TableRow>
        {table.getFlatHeaders().map((header) => {
          const id = header.column.id
          const field = staffSortFields.find((candidate) => candidate === id)
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
                  aria-label={`Sort by ${getHeaderLabel(header.column.columnDef)}${direction ? `, currently ${direction}` : ""}`}
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
                flexRender(header.column.columnDef.header, header.getContext())
              )}
            </TableHead>
          )
        })}
      </TableRow>
    </TableHeader>
  )
}

const SORT_OPTIONS = [
  { label: "Name, A to Z", sort: ["name", "asc"] },
  { label: "Newest first", sort: ["invitedAt", "desc"] },
  { label: "Role", sort: ["role", "asc"] },
] as const

/** Columns (table only) and Sort, shown in the page header row beside View. */
export function StaffTableSettings({
  table,
  showColumns,
}: {
  table: Table<StaffMemberRow>
  showColumns: boolean
}) {
  const { sort, setParams } = useSortParams({ fields: staffSortFields })
  const current =
    SORT_OPTIONS.find(
      (option) =>
        option.sort[0] === sort?.field && option.sort[1] === sort?.direction,
    ) ?? SORT_OPTIONS[0]
  return (
    <TableToolbarPortal>
      {showColumns ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="outline" className="rounded-none">
                Columns
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  data-icon="inline-end"
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              </Button>
            }
          />
          <DropdownMenuContent
            appearance="dashboard"
            align="end"
            sideOffset={8}
            className="min-w-44"
          >
            <DropdownMenuGroup>
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    closeOnClick={false}
                    onCheckedChange={(checked) =>
                      column.toggleVisibility(checked)
                    }
                  >
                    {getHeaderLabel(column.columnDef)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              aria-label={`Sort: ${current.label}`}
            >
              {current.label}
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                data-icon="inline-end"
                className="text-muted-foreground"
                aria-hidden="true"
              />
            </Button>
          }
        />
        <DropdownMenuContent appearance="dashboard" align="end">
          <DropdownMenuRadioGroup
            value={current.label}
            onValueChange={(label) => {
              const option = SORT_OPTIONS.find((item) => item.label === label)
              if (option) void setParams({ sort: [...option.sort] })
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={option.label}
                value={option.label}
                closeOnClick
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableToolbarPortal>
  )
}
