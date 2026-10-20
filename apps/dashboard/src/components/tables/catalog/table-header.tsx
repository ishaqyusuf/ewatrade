"use client"

import {
  ACTIONS_FULL_WIDTH_HEADER_CLASS,
  ACTIONS_STICKY_HEADER_CLASS,
  HorizontalPagination,
  SELECT_COLUMN_ID,
  SelectAllCheckbox,
  type TableColumnMeta,
  type TableScrollState,
  getHeaderLabel,
} from "@/components/tables/core"
import { DraggableHeader } from "@/components/tables/draggable-header"
import { ResizeHandle } from "@/components/tables/resize-handle"
import { catalogSortFields } from "@/hooks/sort-params"
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
  DropdownMenuItem,
  DropdownMenuTrigger,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import type { Table } from "@tanstack/react-table"
import type { CSSProperties } from "react"
import type { CatalogRow } from "./columns"

const FIXED_COLUMNS = new Set([SELECT_COLUMN_ID, "item", "actions"])

export function CatalogTableHeader({
  table,
  sortableColumnIds,
  getStickyStyle,
  getStickyClassName,
  isVisible,
  tableScroll,
}: {
  table: Table<CatalogRow>
  sortableColumnIds: string[]
  getStickyStyle: (columnId: string) => CSSProperties
  getStickyClassName: (columnId: string, baseClassName?: string) => string
  isVisible: (columnId: string) => boolean
  tableScroll?: TableScrollState
}) {
  const { sort, toggleSort } = useSortParams({ fields: catalogSortFields })

  return (
    <TableHeader className="sticky top-0 z-20 block w-full border-0 bg-background">
      {table.getHeaderGroups().map((group) => {
        const headers = group.headers.filter((header) =>
          isVisible(header.column.id),
        )
        const flexId =
          headers.at(-1)?.column.id === "actions"
            ? headers.at(-2)?.column.id
            : undefined
        const hasNonStickyVisible = headers.some((header) => {
          const id = header.column.id
          if (id === "actions") return false
          const meta = header.column.columnDef.meta as
            | TableColumnMeta
            | undefined
          return !FIXED_COLUMNS.has(id) && !meta?.sticky
        })

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
                const fixed = FIXED_COLUMNS.has(id) || Boolean(meta?.sticky)
                const field = catalogSortFields.find(
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
                const actionsFullWidth =
                  id === "actions" && !hasNonStickyVisible
                const style: CSSProperties = actionsFullWidth
                  ? { flex: 1 }
                  : {
                      width: header.getSize(),
                      minWidth: header.getSize(),
                      ...getStickyStyle(id),
                      ...(id === flexId && !meta?.sticky
                        ? { flex: 1 }
                        : undefined),
                    }
                const className = getStickyClassName(
                  id,
                  "group/header relative flex h-full shrink-0 items-center border-t border-border px-4 text-sm font-normal text-muted-foreground",
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
                      label="Select all loaded catalog items"
                    />
                  ) : id === "item" ? (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <div className="min-w-0 overflow-hidden">
                        {sortButton}
                      </div>
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
                      data-table-sticky={
                        fixed && !actionsFullWidth ? "true" : undefined
                      }
                      data-table-sticky-side={
                        id === "actions" && !actionsFullWidth
                          ? "right"
                          : undefined
                      }
                      aria-sort={ariaSort}
                      className={
                        id === "actions"
                          ? actionsFullWidth
                            ? ACTIONS_FULL_WIDTH_HEADER_CLASS
                            : ACTIONS_STICKY_HEADER_CLASS
                          : cn(className, "z-10 bg-background")
                      }
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
        )
      })}
    </TableHeader>
  )
}

export function CatalogTableSettings({
  table,
  showColumns = true,
}: {
  table: Table<CatalogRow>
  showColumns?: boolean
}) {
  const { sort, setParams } = useSortParams({ fields: catalogSortFields })
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline" className="rounded-none">
              Sort by update
            </Button>
          }
        />
        <DropdownMenuContent appearance="dashboard" align="end">
          <DropdownMenuItem
            onClick={() => setParams({ sort: ["updatedAt", "desc"] })}
          >
            Newest first
            {sort?.field === "updatedAt" && sort.direction === "desc"
              ? " ✓"
              : ""}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setParams({ sort: ["updatedAt", "asc"] })}
          >
            Oldest first
            {sort?.field === "updatedAt" && sort.direction === "asc"
              ? " ✓"
              : ""}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {showColumns ? (
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
    </div>
  )
}
