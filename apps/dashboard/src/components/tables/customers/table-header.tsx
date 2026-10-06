"use client"

import {
  HorizontalPagination,
  SELECT_COLUMN_ID,
  SelectAllCheckbox,
  type TableColumnMeta,
  type TableScrollState,
  getHeaderLabel,
} from "@/components/tables/core"
import { customerSortFields } from "@/components/tables/customers/sort"
import { DraggableHeader } from "@/components/tables/draggable-header"
import { ResizeHandle } from "@/components/tables/resize-handle"
import { useSortParams } from "@/hooks/use-sort-params"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
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
  DropdownMenuTrigger,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import type { Table } from "@tanstack/react-table"
import type { CSSProperties } from "react"

export function CustomerTableHeader({
  table,
  sortableColumnIds,
  getStickyStyle,
  getStickyClassName,
  isVisible,
  tableScroll,
}: {
  table: Table<DashboardCustomerRow>
  sortableColumnIds: string[]
  getStickyStyle: (id: string) => CSSProperties
  getStickyClassName: (id: string, className?: string) => string
  isVisible: (id: string) => boolean
  tableScroll: TableScrollState
}) {
  const { sort, toggleSort } = useSortParams({ fields: customerSortFields })
  return (
    <TableHeader className="sticky top-0 z-20 block w-full border-0 bg-background">
      {table.getHeaderGroups().map((group) => {
        const headers = group.headers.filter((header) =>
          isVisible(header.column.id),
        )
        const flexId = headers.at(-1)?.column.id
        return (
          <TableRow
            key={group.id}
            className="flex h-[45px] min-w-full items-center border-b-0 hover:bg-transparent"
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
                const field = customerSortFields.find(
                  (candidate) => candidate === meta?.sortField,
                )
                const direction =
                  field && sort?.field === field ? sort.direction : undefined
                const label =
                  meta?.headerLabel ?? getHeaderLabel(header.column.columnDef)
                const width = header.getSize()
                const hasNonStickyVisible = headers.some((item) => {
                  const itemMeta = item.column.columnDef.meta as
                    | TableColumnMeta
                    | undefined
                  return !itemMeta?.sticky
                })
                const fillsAvailableWidth =
                  !hasNonStickyVisible && id === "name"
                const style: CSSProperties = {
                  width: fillsAvailableWidth ? undefined : width,
                  minWidth: fillsAvailableWidth ? undefined : width,
                  ...(fillsAvailableWidth ? {} : getStickyStyle(id)),
                  ...(fillsAvailableWidth || (id === flexId && !meta?.sticky)
                    ? { flex: 1 }
                    : {}),
                }
                const className = getStickyClassName(
                  id,
                  "group/header relative flex h-full shrink-0 items-center border-t border-border bg-background px-4 text-sm font-normal text-muted-foreground",
                )
                const sortButton = field ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-w-0 rounded-none p-0 text-sm font-normal hover:bg-transparent"
                    aria-label={`Sort by ${label}${direction ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ", not sorted"}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      void toggleSort(field)
                    }}
                  >
                    <span className="truncate">{label}</span>
                    <span aria-hidden="true">
                      {direction === "asc"
                        ? " ↑"
                        : direction === "desc"
                          ? " ↓"
                          : ""}
                    </span>
                  </Button>
                ) : (
                  <span className="truncate">{label}</span>
                )
                const contents =
                  id === SELECT_COLUMN_ID ? (
                    <SelectAllCheckbox
                      table={table}
                      label="Select all loaded customers"
                    />
                  ) : id === "name" ? (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
                      {sortButton}
                      {tableScroll.isScrollable ? (
                        <HorizontalPagination
                          canScrollLeft={tableScroll.canScrollLeft}
                          canScrollRight={tableScroll.canScrollRight}
                          onScrollLeft={tableScroll.scrollLeft}
                          onScrollRight={tableScroll.scrollRight}
                          className="shrink-0"
                        />
                      ) : null}
                    </div>
                  ) : (
                    sortButton
                  )
                const ariaSort = field
                  ? direction === "asc"
                    ? "ascending"
                    : direction === "desc"
                      ? "descending"
                      : "none"
                  : undefined
                const resize = header.column.getCanResize() ? (
                  <ResizeHandle header={header} />
                ) : null
                if (!sortableColumnIds.includes(id)) {
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      data-table-column-id={id}
                      data-table-sticky={meta?.sticky ? "true" : undefined}
                      data-table-sticky-side={meta?.sticky ? "left" : undefined}
                      aria-sort={ariaSort}
                      className={className}
                      style={style}
                    >
                      {contents}
                      {resize}
                    </TableHead>
                  )
                }
                return (
                  <DraggableHeader
                    key={header.id}
                    id={id}
                    sticky={Boolean(meta?.sticky)}
                    ariaSort={ariaSort}
                    className={className}
                    style={style}
                  >
                    {contents}
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

export function CustomerTableSettings({
  table,
}: { table: Table<DashboardCustomerRow> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="rounded-none">
            Columns
          </Button>
        }
      />
      <DropdownMenuContent
        appearance="dashboard"
        align="end"
        className="min-w-48"
      >
        <DropdownMenuGroup>
          {table
            .getAllLeafColumns()
            .filter((column) => column.getCanHide())
            .map((column) => {
              const meta = column.columnDef.meta as TableColumnMeta | undefined
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
  )
}
