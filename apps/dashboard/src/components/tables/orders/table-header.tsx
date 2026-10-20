"use client"

import {
  SELECT_COLUMN_ID,
  SelectAllCheckbox,
  type TableColumnMeta,
  TableToolbarPortal,
  getHeaderLabel,
} from "@/components/tables/core"
import { DraggableHeader } from "@/components/tables/draggable-header"
import { ResizeHandle } from "@/components/tables/resize-handle"
import { orderSortFields } from "@/hooks/sort-params"
import { useSortParams } from "@/hooks/use-sort-params"
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
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
import type { Table } from "@tanstack/react-table"
import type { CSSProperties, ReactNode } from "react"
import type { OrderRow } from "./columns"

const STICKY_COLUMN_IDS = new Set([SELECT_COLUMN_ID, "orderNumber"])

type OrderSort = {
  field: (typeof orderSortFields)[number]
  direction: "asc" | "desc"
}

export function OrdersTableHeader({
  table,
  sortableColumnIds,
  sort,
  toggleSort,
  getStickyStyle,
  getStickyClassName,
  isVisible,
  scrollControls,
}: {
  table: Table<OrderRow>
  sortableColumnIds: string[]
  sort?: OrderSort
  toggleSort: (field: OrderSort["field"]) => Promise<unknown>
  getStickyStyle: (columnId: string) => CSSProperties
  getStickyClassName: (columnId: string, baseClassName?: string) => string
  isVisible: (columnId: string) => boolean
  scrollControls?: ReactNode
}) {
  return (
    <TableHeader className="sticky top-0 z-20 block w-full border-0 bg-background">
      {table.getHeaderGroups().map((group) => {
        const headers = group.headers.filter((header) =>
          isVisible(header.column.id),
        )
        const flexColumnId = headers.at(-1)?.column.id

        return (
          <TableRow
            className="flex h-[45px] min-w-full items-center border-b-0 hover:bg-transparent"
            key={group.id}
          >
            <SortableContext
              items={sortableColumnIds}
              strategy={horizontalListSortingStrategy}
            >
              {headers.map((header) => {
                const id = header.column.id
                const meta = header.column.columnDef.meta as
                  | TableColumnMeta
                  | undefined
                const isSticky =
                  STICKY_COLUMN_IDS.has(id) || Boolean(meta?.sticky)
                const field = orderSortFields.find(
                  (candidate) => candidate === meta?.sortField,
                )
                const sortDirection =
                  field && sort?.field === field ? sort.direction : undefined
                const label =
                  meta?.headerLabel ?? getHeaderLabel(header.column.columnDef)
                const shouldFlex = id === flexColumnId
                const style: CSSProperties = {
                  width: header.getSize(),
                  minWidth: header.getSize(),
                  ...getStickyStyle(id),
                  ...(shouldFlex ? { flex: 1 } : undefined),
                }
                const className = getStickyClassName(
                  id,
                  "group/header relative flex h-full shrink-0 items-center border-t border-border px-4 text-sm font-normal text-muted-foreground",
                )
                const sortControl =
                  id === SELECT_COLUMN_ID ? (
                    <SelectAllCheckbox
                      table={table}
                      label="Select all loaded orders"
                    />
                  ) : field ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto min-w-0 p-0 text-left font-normal hover:bg-transparent"
                      aria-label={`Sort by ${label}${sortDirection ? `, currently ${sortDirection === "asc" ? "ascending" : "descending"}` : ", not sorted"}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void toggleSort(field)
                      }}
                    >
                      <span className="truncate">{label}</span>
                      <span aria-hidden="true">
                        {sortDirection === "asc"
                          ? " ↑"
                          : sortDirection === "desc"
                            ? " ↓"
                            : ""}
                      </span>
                    </Button>
                  ) : (
                    <span className="truncate">{label}</span>
                  )
                const content =
                  id === "orderNumber" ? (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      {sortControl}
                      {scrollControls}
                    </div>
                  ) : (
                    sortControl
                  )
                const resize = header.column.getCanResize() ? (
                  <ResizeHandle header={header} />
                ) : null

                if (!sortableColumnIds.includes(id)) {
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      data-table-column-id={id}
                      data-table-sticky={isSticky ? "true" : undefined}
                      aria-sort={
                        sortDirection === "asc"
                          ? "ascending"
                          : sortDirection === "desc"
                            ? "descending"
                            : field
                              ? "none"
                              : undefined
                      }
                      className={`${className} z-10 bg-background`}
                      style={style}
                    >
                      {content}
                      {resize}
                    </TableHead>
                  )
                }

                return (
                  <DraggableHeader
                    key={header.id}
                    id={id}
                    sticky={isSticky}
                    ariaSort={
                      sortDirection === "asc"
                        ? "ascending"
                        : sortDirection === "desc"
                          ? "descending"
                          : field
                            ? "none"
                            : undefined
                    }
                    className={className}
                    style={style}
                  >
                    {content}
                    {resize}
                  </DraggableHeader>
                )
              })}
            </SortableContext>
          </TableRow>
        )
      })}
    </TableHeader>
  )
}

/** Newest first is the list's default order, so choosing it clears the sort. */
const ORDER_SORTS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "total:desc", label: "Highest total" },
  { value: "total:asc", label: "Lowest total" },
  { value: "orderNumber:asc", label: "Order number" },
  { value: "status:asc", label: "Status" },
] as const

const SORT_FIELD_LABELS: Record<OrderSort["field"], string> = {
  createdAt: "Date",
  orderNumber: "Order number",
  status: "Status",
  total: "Total",
}

function sortLabel(sort?: OrderSort) {
  if (!sort) return ORDER_SORTS[0].label
  const value = `${sort.field}:${sort.direction}`
  return (
    ORDER_SORTS.find((option) => option.value === value)?.label ??
    `${SORT_FIELD_LABELS[sort.field]}, ${sort.direction === "asc" ? "ascending" : "descending"}`
  )
}

function ChevronDown() {
  return (
    <HugeiconsIcon
      icon={ArrowDown01Icon}
      data-icon="inline-end"
      className="text-muted-foreground"
      aria-hidden="true"
    />
  )
}

/** Columns (Table view only) and Sort, shown in the page header row. */
export function OrdersTableSettings({
  table,
  showColumns,
}: {
  table: Table<OrderRow>
  showColumns: boolean
}) {
  const { sort, setParams } = useSortParams({ fields: orderSortFields })
  const current = sort ? `${sort.field}:${sort.direction}` : "createdAt:desc"
  const label = sortLabel(sort)
  return (
    <TableToolbarPortal>
      {showColumns ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="outline" className="rounded-none">
                Columns
                <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent
            appearance="dashboard"
            align="end"
            sideOffset={8}
            className="min-w-48"
          >
            <DropdownMenuGroup>
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  const meta = column.columnDef.meta as
                    | TableColumnMeta
                    | undefined
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      closeOnClick={false}
                      onCheckedChange={(checked) =>
                        column.toggleVisibility(checked)
                      }
                    >
                      {meta?.headerLabel ?? getHeaderLabel(column.columnDef)}
                    </DropdownMenuCheckboxItem>
                  )
                })}
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
              aria-label={`Sort orders: ${label}`}
            />
          }
        >
          {label}
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          appearance="dashboard"
          align="end"
          className="min-w-44"
        >
          <DropdownMenuRadioGroup
            aria-label="Sort orders"
            value={current}
            onValueChange={(value) => {
              const [field, direction] = String(value).split(":")
              void setParams({
                sort:
                  value === "createdAt:desc" || !field || !direction
                    ? null
                    : [field, direction],
              })
            }}
          >
            {ORDER_SORTS.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
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
