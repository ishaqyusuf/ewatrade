"use client"

import {
  HorizontalPagination,
  SELECT_COLUMN_ID,
  SelectAllCheckbox,
  TABLE_HEADER_CELL_CLASS,
  type TableColumnMeta,
  type TableScrollState,
  getHeaderLabel,
} from "@/components/tables/core"
import { DraggableHeader } from "@/components/tables/draggable-header"
import { ResizeHandle } from "@/components/tables/resize-handle"
import { useSortParams } from "@/hooks/use-sort-params"
import { cn } from "@/utils"
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
import { type InventoryBalance, inventorySortFields } from "./columns"

const FIXED_COLUMNS = new Set([SELECT_COLUMN_ID, "product", "actions"])

export function InventoryTableHeader({
  table,
  sortableColumnIds,
  getStickyStyle,
  getStickyClassName,
  isVisible,
  tableScroll,
}: {
  table: Table<InventoryBalance>
  sortableColumnIds: string[]
  getStickyStyle: (columnId: string) => CSSProperties
  getStickyClassName: (columnId: string, baseClassName?: string) => string
  isVisible: (columnId: string) => boolean
  tableScroll?: TableScrollState
}) {
  const { sort, toggleSort } = useSortParams({ fields: inventorySortFields })

  return (
    <TableHeader className="sticky top-0 z-20 block w-full border-0 bg-background">
      {table.getHeaderGroups().map((group) => (
        <TableRow
          key={group.id}
          className="flex h-[45px] min-w-full items-center border-b-0 hover:bg-transparent"
        >
          <SortableContext
            items={sortableColumnIds}
            strategy={horizontalListSortingStrategy}
          >
            {group.headers.map((header) => {
              const id = header.column.id
              if (!isVisible(id)) return null
              const meta = header.column.columnDef.meta as
                | TableColumnMeta
                | undefined
              const fixed = FIXED_COLUMNS.has(id) || Boolean(meta?.sticky)
              const field = inventorySortFields.find(
                (candidate) => candidate === meta?.sortField,
              )
              const direction =
                field && sort?.field === field ? sort.direction : undefined
              const ariaSort = field
                ? direction === "asc"
                  ? "ascending"
                  : direction === "desc"
                    ? "descending"
                    : "none"
                : undefined
              const label =
                meta?.headerLabel ?? getHeaderLabel(header.column.columnDef)
              const style: CSSProperties = {
                width: header.getSize(),
                minWidth: header.getSize(),
                ...getStickyStyle(id),
              }
              const className = getStickyClassName(
                id,
                cn(
                  TABLE_HEADER_CELL_CLASS,
                  ["onHand", "reserved", "available"].includes(id) &&
                    "justify-end",
                ),
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
              const content =
                id === SELECT_COLUMN_ID ? (
                  <SelectAllCheckbox
                    table={table}
                    label="Select all loaded inventory balances"
                  />
                ) : id === "product" ? (
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <div className="min-w-0 overflow-hidden">{sortButton}</div>
                    {tableScroll?.isScrollable ? (
                      <HorizontalPagination
                        canScrollLeft={tableScroll.canScrollLeft}
                        canScrollRight={tableScroll.canScrollRight}
                        onScrollLeft={tableScroll.scrollLeft}
                        onScrollRight={tableScroll.scrollRight}
                        className="hidden shrink-0 md:flex"
                      />
                    ) : null}
                  </div>
                ) : (
                  sortButton
                )
              const resize = header.column.getCanResize() ? (
                <ResizeHandle header={header} />
              ) : null

              if (fixed || !sortableColumnIds.includes(id)) {
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    data-table-column-id={id}
                    data-table-sticky={fixed ? "true" : undefined}
                    aria-sort={ariaSort}
                    className={cn(className, "z-10 bg-background")}
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
                  ariaSort={ariaSort}
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
      ))}
    </TableHeader>
  )
}

export function InventoryTableSettings({
  table,
}: {
  table: Table<InventoryBalance>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline" className="rounded-none">
            Columns
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
