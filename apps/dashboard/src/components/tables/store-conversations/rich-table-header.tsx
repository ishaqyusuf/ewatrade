"use client"

import {
  ACTIONS_FULL_WIDTH_HEADER_CLASS,
  ACTIONS_STICKY_HEADER_CLASS,
  SELECT_COLUMN_ID,
  SelectAllCheckbox,
  TABLE_HEADER_CELL_CLASS,
  type TableColumnMeta,
  getHeaderLabel,
} from "@/components/tables/core"
import { DraggableHeader } from "@/components/tables/draggable-header"
import { ResizeHandle } from "@/components/tables/resize-handle"
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
import type { CSSProperties, ReactNode } from "react"
import type { StoreConversationQueueItem } from "./columns"

type SortField = "last_customer_activity" | "response_due_at"
const SORT_FIELDS = ["last_customer_activity", "response_due_at"] as const

export function StoreConversationRichTableHeader({
  table,
  sortableColumnIds,
  sort,
  toggleSort,
  getStickyStyle,
  getStickyClassName,
  isVisible,
  scrollControls,
}: {
  table: Table<StoreConversationQueueItem>
  sortableColumnIds: string[]
  sort: [SortField, "asc" | "desc"]
  toggleSort: (field: SortField) => void
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
        const flexColumnId =
          headers.at(-1)?.column.id === "actions"
            ? headers.at(-2)?.column.id
            : headers.at(-1)?.column.id
        const hasNonStickyVisible = headers.some((header) => {
          const meta = header.column.columnDef.meta as
            | TableColumnMeta
            | undefined
          return header.column.id !== "actions" && !meta?.sticky
        })
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
                const sticky = Boolean(meta?.sticky)
                const actionsFullWidth =
                  id === "actions" && !hasNonStickyVisible
                const field = SORT_FIELDS.find(
                  (candidate) => candidate === meta?.sortField,
                )
                const direction =
                  field && sort[0] === field ? sort[1] : undefined
                const label =
                  meta?.headerLabel ?? getHeaderLabel(header.column.columnDef)
                const style: CSSProperties = actionsFullWidth
                  ? { flex: 1, minWidth: 0 }
                  : {
                      width: header.getSize(),
                      minWidth: header.getSize(),
                      ...getStickyStyle(id),
                      ...(id === flexColumnId && !sticky
                        ? { flex: 1 }
                        : undefined),
                    }
                const content = field ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-w-0 p-0 text-left font-normal hover:bg-transparent"
                    aria-label={`Sort by ${label}${direction ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ", not sorted"}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleSort(field)
                    }}
                    appearance="form"
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
                const headerContent =
                  id === SELECT_COLUMN_ID ? (
                    <SelectAllCheckbox
                      table={table}
                      label="Select all loaded conversations"
                    />
                  ) : id === "conversation" ? (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      {content}
                      {scrollControls}
                    </div>
                  ) : (
                    content
                  )
                const className = getStickyClassName(
                  id,
                  TABLE_HEADER_CELL_CLASS,
                )
                const resize = header.column.getCanResize() ? (
                  <ResizeHandle header={header} />
                ) : null
                const ariaSort = field
                  ? direction === "asc"
                    ? "ascending"
                    : direction === "desc"
                      ? "descending"
                      : "none"
                  : undefined
                if (!sortableColumnIds.includes(id)) {
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      data-table-column-id={id}
                      data-table-sticky={
                        sticky && !actionsFullWidth ? "true" : undefined
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
                          : `${className} z-10 bg-background`
                      }
                      style={style}
                    >
                      {headerContent}
                      {resize}
                    </TableHead>
                  )
                }
                return (
                  <DraggableHeader
                    key={header.id}
                    id={id}
                    sticky={sticky}
                    stickySide={id === "actions" ? "right" : "left"}
                    ariaSort={ariaSort}
                    className={className}
                    style={style}
                  >
                    {headerContent}
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

export function StoreConversationColumnSettings({
  table,
}: { table: Table<StoreConversationQueueItem> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="rounded-none"
            appearance="form"
          >
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
