"use client"

import { cn } from "@/utils"
import type {
  ColumnDef,
  ColumnSizingState,
  VisibilityState,
} from "@tanstack/react-table"
import { useMemo } from "react"
import { SkeletonCell } from "./skeleton-cell"
import { type TableColumnMeta, getColumnId, getHeaderLabel } from "./types"

export interface TableSkeletonProps<TData> {
  columns: ColumnDef<TData>[]
  rowCount?: number
  rowHeight?: number
  columnVisibility?: VisibilityState
  columnSizing?: ColumnSizingState
  columnOrder?: string[]
  stickyColumnIds?: string[]
  actionsColumnId?: string
  isEmpty?: boolean
  className?: string
}

/** Adaptive skeleton that follows the current table columns and saved layout. */
export function TableSkeleton<TData>({
  columns,
  rowCount = 40,
  rowHeight = 45,
  columnVisibility = {},
  columnSizing = {},
  columnOrder = [],
  stickyColumnIds = [],
  actionsColumnId = "actions",
  isEmpty = false,
  className,
}: TableSkeletonProps<TData>) {
  const skeletonRows = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, index) => ({
        id: `skeleton-${rowCount}-${index}`,
      })),
    [rowCount],
  )

  const visibleColumns = useMemo(() => {
    const ids = columns.map(getColumnId)
    const orderedIds = columnOrder.length
      ? [
          ...columnOrder.filter((id) => ids.includes(id)),
          ...ids.filter((id) => !columnOrder.includes(id)),
        ]
      : ids
    return orderedIds
      .map((id) => columns.find((column) => getColumnId(column) === id))
      .filter((column): column is ColumnDef<TData> => Boolean(column))
      .filter((column) => {
        const id = getColumnId(column)
        return (
          column.enableHiding === false ||
          (id !== "select" &&
            id !== actionsColumnId &&
            columnVisibility[id] !== false)
        )
      })
  }, [actionsColumnId, columnOrder, columnVisibility, columns])

  const leftOffsets = useMemo(() => {
    const offsets: Record<string, number> = {}
    let offset = 0
    for (const id of stickyColumnIds) {
      const column = visibleColumns.find((item) => getColumnId(item) === id)
      if (!column) continue
      offsets[id] = offset
      offset += columnSizing[id] ?? column.size ?? 150
    }
    return offsets
  }, [columnSizing, stickyColumnIds, visibleColumns])

  const hasScrollableColumns = visibleColumns.some((column) => {
    const id = getColumnId(column)
    return (
      id !== actionsColumnId &&
      !stickyColumnIds.includes(id) &&
      !(column.meta as TableColumnMeta | undefined)?.sticky
    )
  })
  const lastColumn = visibleColumns.at(-1)
  const lastColumnId = lastColumn ? getColumnId(lastColumn) : undefined
  const flexColumn = visibleColumns.at(
    lastColumnId === actionsColumnId ? -2 : -1,
  )
  const flexColumnId = flexColumn ? getColumnId(flexColumn) : undefined

  function getColumnLayout(column: ColumnDef<TData>) {
    const id = getColumnId(column)
    const isActions = id === actionsColumnId
    const actionFillsWidth = isActions && !hasScrollableColumns
    const isSticky = stickyColumnIds.includes(id) && !isActions
    const width = columnSizing[id] ?? column.size ?? 150
    const shouldFlex =
      actionFillsWidth ||
      (id === flexColumnId && (lastColumnId !== actionsColumnId || !isSticky))
    return {
      isActions,
      isSticky,
      actionFillsWidth,
      style: {
        width: actionFillsWidth ? undefined : width,
        minWidth: actionFillsWidth ? 0 : width,
        ...(isActions && !actionFillsWidth ? { right: 0 } : undefined),
        ...(isSticky ? { left: leftOffsets[id] ?? 0 } : undefined),
        ...(shouldFlex ? { flex: 1 } : undefined),
      },
    }
  }

  return (
    <div className={cn("w-full overflow-auto", className)}>
      <table
        style={{
          width: visibleColumns.reduce(
            (total, column) =>
              total + (columnSizing[getColumnId(column)] ?? column.size ?? 150),
            0,
          ),
        }}
        className={cn(
          "min-w-full border-collapse text-left text-sm",
          isEmpty && "pointer-events-none opacity-40 blur-[2px]",
        )}
      >
        <thead className="sticky top-0 z-20 bg-background">
          <tr className="flex h-[45px] min-w-full items-center">
            {visibleColumns.map((column) => {
              const id = getColumnId(column)
              const { isSticky, isActions, actionFillsWidth, style } =
                getColumnLayout(column)
              return (
                <th
                  key={id}
                  data-table-column-id={id}
                  data-table-sticky={isSticky ? "true" : undefined}
                  scope="col"
                  className={cn(
                    "flex h-full shrink-0 items-center border-b border-border px-4 text-xs font-medium text-muted-foreground",
                    isSticky && "z-10 bg-background md:sticky",
                    isActions &&
                      !actionFillsWidth &&
                      "z-10 ml-auto justify-center bg-background md:sticky md:right-0",
                    actionFillsWidth && "justify-center bg-background",
                  )}
                  style={style}
                >
                  {id === "select" ? (
                    <SkeletonCell type="checkbox" />
                  ) : (
                    getHeaderLabel(column)
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {skeletonRows.map((skeletonRow) => (
            <tr
              key={skeletonRow.id}
              className="group flex items-center border-b border-border"
              style={{ height: rowHeight }}
            >
              {visibleColumns.map((column) => {
                const id = getColumnId(column)
                const meta = column.meta as TableColumnMeta | undefined
                const { isSticky, isActions, actionFillsWidth, style } =
                  getColumnLayout(column)
                return (
                  <td
                    key={id}
                    className={cn(
                      "flex h-full shrink-0 items-center overflow-hidden px-4",
                      isSticky && "z-10 bg-background md:sticky",
                      isActions &&
                        !actionFillsWidth &&
                        "z-10 justify-center bg-background md:sticky md:right-0",
                      actionFillsWidth && "justify-center bg-background",
                      !actionFillsWidth && meta?.className,
                    )}
                    style={style}
                  >
                    {meta?.skeleton ? (
                      <SkeletonCell
                        type={meta.skeleton.type}
                        width={meta.skeleton.width}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-24 animate-pulse rounded bg-muted"
                      />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
