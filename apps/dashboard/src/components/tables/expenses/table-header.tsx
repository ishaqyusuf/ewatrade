"use client"

import type { FinanceBillRow } from "@/components/finance/types"
import {
  HorizontalPagination,
  SELECT_COLUMN_ID,
  SelectAllCheckbox,
  type TableColumnMeta,
  type TableScrollState,
  getHeaderLabel,
} from "@/components/tables/core"
import { DraggableHeader } from "@/components/tables/draggable-header"
import { ResizeHandle } from "@/components/tables/resize-handle"
import { expenseSortFields } from "@/hooks/sort-params"
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
  DropdownMenuTrigger,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import type { Table } from "@tanstack/react-table"
import type { CSSProperties } from "react"

const STICKY_COLUMN_IDS = new Set(["select", "description", "actions"])

export function ExpenseTableHeader({
  table,
  sortableColumnIds,
  getStickyStyle,
  getStickyClassName,
  isVisible,
  tableScroll,
}: {
  table: Table<FinanceBillRow>
  sortableColumnIds: string[]
  getStickyStyle: (columnId: string) => CSSProperties
  getStickyClassName: (columnId: string, baseClassName?: string) => string
  isVisible: (columnId: string) => boolean
  tableScroll?: TableScrollState
}) {
  const { sort, toggleSort } = useSortParams({ fields: expenseSortFields })

  return (
    <TableHeader className="sticky top-0 z-20 block w-full border-0 bg-background">
      {table.getHeaderGroups().map((group) => {
        const headers = group.headers.filter((header) =>
          isVisible(header.column.id),
        )
        const flexColumnId =
          headers.at(-1)?.column.id === "actions"
            ? headers.at(-2)?.column.id
            : undefined

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
                const isAction = id === "actions"
                const isSticky =
                  STICKY_COLUMN_IDS.has(id) || Boolean(meta?.sticky)
                const actionsFullWidth =
                  isAction &&
                  !headers.some(
                    (h) =>
                      h.column.id !== "actions" &&
                      !(h.column.columnDef.meta as TableColumnMeta | undefined)
                        ?.sticky,
                  )
                const shouldFlex =
                  (id === flexColumnId && !meta?.sticky) || actionsFullWidth
                const field = expenseSortFields.find(
                  (candidate) => candidate === meta?.sortField,
                )
                const sortDirection =
                  field && sort?.field === field ? sort.direction : undefined
                const sortLabel =
                  meta?.headerLabel ?? getHeaderLabel(header.column.columnDef)
                const style: CSSProperties = {
                  width: actionsFullWidth ? undefined : header.getSize(),
                  minWidth: actionsFullWidth ? 0 : header.getSize(),
                  ...(!actionsFullWidth && getStickyStyle(id)),
                  ...(shouldFlex ? { flex: 1 } : undefined),
                }
                const className = getStickyClassName(
                  id,
                  "group/header relative flex h-full shrink-0 items-center border-t border-border px-4 text-sm font-normal text-muted-foreground",
                )
                const ariaSort = field
                  ? sortDirection === "asc"
                    ? "ascending"
                    : sortDirection === "desc"
                      ? "descending"
                      : "none"
                  : undefined
                const content =
                  id === SELECT_COLUMN_ID ? (
                    <SelectAllCheckbox
                      table={table}
                      label="Select all loaded expenses"
                    />
                  ) : isAction ? (
                    <span>Actions</span>
                  ) : field ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto min-w-0 rounded-none p-0 text-sm font-normal hover:bg-transparent"
                      aria-label={`Sort by ${sortLabel}${sortDirection ? `, currently ${sortDirection === "asc" ? "ascending" : "descending"}` : ", not sorted"}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void toggleSort(field)
                      }}
                    >
                      <span className="truncate">{sortLabel}</span>
                      <span aria-hidden="true">
                        {sortDirection === "asc"
                          ? " ↑"
                          : sortDirection === "desc"
                            ? " ↓"
                            : ""}
                      </span>
                    </Button>
                  ) : (
                    <span className="truncate">{sortLabel}</span>
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
                      data-table-sticky={
                        isSticky && !actionsFullWidth ? "true" : undefined
                      }
                      data-table-sticky-side={
                        isAction && !actionsFullWidth ? "right" : undefined
                      }
                      aria-sort={ariaSort}
                      className={`${className} ${isAction ? "justify-center border-l" : "z-10 bg-background"}`}
                      style={style}
                    >
                      {id === "description" && tableScroll?.isScrollable ? (
                        <div className="flex w-full min-w-0 items-center justify-between gap-2">
                          {content}
                          <HorizontalPagination
                            className="hidden shrink-0 md:flex"
                            canScrollLeft={tableScroll.canScrollLeft}
                            canScrollRight={tableScroll.canScrollRight}
                            onScrollLeft={tableScroll.scrollLeft}
                            onScrollRight={tableScroll.scrollRight}
                          />
                        </div>
                      ) : (
                        content
                      )}
                      {resize}
                    </TableHead>
                  )
                }

                return (
                  <DraggableHeader
                    key={header.id}
                    id={id}
                    sticky={isSticky}
                    stickySide={isAction ? "right" : "left"}
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

export function ExpenseTableSettings({
  table,
}: {
  table: Table<FinanceBillRow>
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
