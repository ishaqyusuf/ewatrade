"use client"

import {
  ACTIONS_FULL_WIDTH_HEADER_CLASS,
  ACTIONS_STICKY_HEADER_CLASS,
  type TableColumnMeta,
  getHeaderLabel,
} from "@/components/tables/core"
import { DraggableHeader } from "@/components/tables/draggable-header"
import { ResizeHandle } from "@/components/tables/resize-handle"
import { PRESCRIPTION_SORT_FIELDS } from "@/hooks/use-prescription-filter-params"
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
import type { PrescriptionQueueRow } from "./columns"

const STICKY_COLUMN_IDS = new Set(["reference", "actions"])
type PrescriptionSortField = (typeof PRESCRIPTION_SORT_FIELDS)[number]
type PrescriptionSort = [PrescriptionSortField, "asc" | "desc"] | null

export function PrescriptionTableHeader({
  table,
  sortableColumnIds,
  sort,
  toggleSort,
  getStickyStyle,
  getStickyClassName,
  isVisible,
  scrollControls,
}: {
  table: Table<PrescriptionQueueRow>
  sortableColumnIds: string[]
  sort: PrescriptionSort
  toggleSort: (field: PrescriptionSortField) => void
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
          return (
            header.column.id !== "actions" &&
            !STICKY_COLUMN_IDS.has(header.column.id) &&
            !meta?.sticky
          )
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
                const isSticky =
                  STICKY_COLUMN_IDS.has(id) || Boolean(meta?.sticky)
                const actionsFullWidth =
                  id === "actions" && !hasNonStickyVisible
                const field = PRESCRIPTION_SORT_FIELDS.find(
                  (candidate) => candidate === meta?.sortField,
                )
                const sortDirection =
                  field && sort?.[0] === field ? sort[1] : undefined
                const label =
                  meta?.headerLabel ?? getHeaderLabel(header.column.columnDef)
                const style: CSSProperties = actionsFullWidth
                  ? { flex: 1, minWidth: 0 }
                  : {
                      width: header.getSize(),
                      minWidth: header.getSize(),
                      ...getStickyStyle(id),
                      ...(id === flexColumnId && !meta?.sticky
                        ? { flex: 1 }
                        : undefined),
                    }
                const className =
                  id === "actions"
                    ? actionsFullWidth
                      ? ACTIONS_FULL_WIDTH_HEADER_CLASS
                      : ACTIONS_STICKY_HEADER_CLASS
                    : getStickyClassName(
                        id,
                        "group/header relative flex h-full shrink-0 items-center border-t border-border px-4 text-sm font-normal text-muted-foreground",
                      )
                const sortControl = field ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-w-0 p-0 text-left font-normal hover:bg-transparent"
                    aria-label={`Sort by ${label}${sortDirection ? `, currently ${sortDirection === "asc" ? "ascending" : "descending"}` : ", not sorted"}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleSort(field)
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
                  id === "reference" ? (
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
                const ariaSort = field
                  ? sortDirection === "asc"
                    ? "ascending"
                    : sortDirection === "desc"
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
                        isSticky && !actionsFullWidth ? "true" : undefined
                      }
                      data-table-sticky-side={
                        id === "actions" && !actionsFullWidth
                          ? "right"
                          : undefined
                      }
                      aria-sort={ariaSort}
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
                    stickySide={id === "actions" ? "right" : "left"}
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

export function PrescriptionTableSettings({
  table,
}: {
  table: Table<PrescriptionQueueRow>
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
