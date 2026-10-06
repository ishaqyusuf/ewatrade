"use client"

import { cn } from "@/utils"
import type {
  Cell,
  ColumnOrderState,
  ColumnSizingState,
  Row,
  VisibilityState,
} from "@tanstack/react-table"
import { flexRender } from "@tanstack/react-table"
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react"
import { memo } from "react"
import { ACTIONS_FULL_WIDTH_CELL_CLASS, type TableColumnMeta } from "./types"

export interface VirtualRowProps<TData> {
  row: Row<TData>
  virtualStart: number
  rowHeight: number
  getStickyStyle: (columnId: string) => CSSProperties
  getStickyClassName: (columnId: string, baseClassName?: string) => string
  onRowOpen?: (row: Row<TData>) => void
  nonClickableColumns?: ReadonlySet<string>
  columnSizing?: ColumnSizingState
  columnOrder?: ColumnOrderState
  columnVisibility?: VisibilityState
  isSelected?: boolean
  /** Re-renders memoized checkboxes when selection is paused, e.g. during refresh. */
  isSelectionDisabled?: boolean
  isExporting?: boolean
  className?: string
}

const DEFAULT_NON_CLICKABLE_COLUMNS = new Set(["select", "actions"])
const INTERACTIVE_TARGET =
  "a, button, input, select, textarea, summary, [contenteditable='true'], [role='button'], [role='checkbox'], [role='combobox'], [data-row-interactive='true']"

function VirtualRowInner<TData>({
  row,
  virtualStart,
  rowHeight,
  getStickyStyle,
  getStickyClassName,
  onRowOpen,
  nonClickableColumns = DEFAULT_NON_CLICKABLE_COLUMNS,
  isSelected = false,
  isSelectionDisabled,
  isExporting = false,
  className,
}: VirtualRowProps<TData>) {
  const cells = row.getVisibleCells()
  const hasScrollableColumns = cells.some((cell) => {
    const id = cell.column.id
    const meta = cell.column.columnDef.meta as TableColumnMeta | undefined
    return id !== "actions" && !(meta?.sticky ?? false)
  })
  const lastCellId = cells[cells.length - 1]?.column.id ?? ""

  function openFromClick(event: MouseEvent<HTMLTableRowElement>) {
    if (!onRowOpen || (event.target as Element).closest(INTERACTIVE_TARGET)) {
      return
    }
    onRowOpen(row)
  }

  function openFromKeyboard(event: KeyboardEvent<HTMLTableRowElement>) {
    if (
      !onRowOpen ||
      (event.key !== "Enter" && event.key !== " ") ||
      event.target !== event.currentTarget
    ) {
      return
    }
    event.preventDefault()
    onRowOpen(row)
  }

  return (
    <tr
      data-index={row.index}
      data-row-id={row.id}
      aria-selected={isSelected || undefined}
      data-selection-disabled={isSelectionDisabled || undefined}
      tabIndex={onRowOpen ? 0 : undefined}
      onClick={openFromClick}
      onKeyDown={openFromKeyboard}
      className={cn(
        "group absolute left-0 top-0 flex w-full min-w-full items-center border-0",
        onRowOpen && "cursor-pointer",
        isSelected && "bg-muted/60",
        "hover:bg-muted/40",
        isExporting && "opacity-60",
        className,
      )}
      style={{
        height: rowHeight,
        transform: `translateY(${virtualStart}px)`,
        contain: "layout style paint",
      }}
    >
      {cells.map((cell: Cell<TData, unknown>, index) => {
        const id = cell.column.id
        const meta = cell.column.columnDef.meta as TableColumnMeta | undefined
        const isAction = id === "actions"
        const isLastBeforeActions =
          index === cells.length - 2 && lastCellId === "actions"
        const actionFillsWidth = isAction && !hasScrollableColumns
        const shouldFlex =
          actionFillsWidth ||
          (isLastBeforeActions && !meta?.sticky) ||
          (lastCellId !== "actions" && index === cells.length - 1)
        const style: CSSProperties = {
          width: actionFillsWidth ? undefined : cell.column.getSize(),
          minWidth: actionFillsWidth ? 0 : cell.column.getSize(),
          ...(!actionFillsWidth && getStickyStyle(id)),
          ...(shouldFlex ? { flex: 1 } : undefined),
        }

        return (
          <td
            key={cell.id}
            data-column-id={id}
            data-row-interactive={nonClickableColumns.has(id) || undefined}
            className={cn(
              "flex h-full items-center overflow-hidden border-b border-border px-4",
              actionFillsWidth && ACTIONS_FULL_WIDTH_CELL_CLASS,
              !actionFillsWidth && getStickyClassName(id, meta?.className),
              isAction && "justify-center",
            )}
            style={style}
          >
            <div className="w-full min-w-0 overflow-hidden truncate">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          </td>
        )
      })}
    </tr>
  )
}

function arePropsEqual<TData>(
  previous: VirtualRowProps<TData>,
  next: VirtualRowProps<TData>,
) {
  return (
    previous.row.id === next.row.id &&
    previous.row.original === next.row.original &&
    previous.virtualStart === next.virtualStart &&
    previous.rowHeight === next.rowHeight &&
    previous.isSelected === next.isSelected &&
    previous.isSelectionDisabled === next.isSelectionDisabled &&
    previous.isExporting === next.isExporting &&
    previous.columnSizing === next.columnSizing &&
    previous.columnOrder === next.columnOrder &&
    previous.columnVisibility === next.columnVisibility &&
    previous.getStickyStyle === next.getStickyStyle &&
    previous.getStickyClassName === next.getStickyClassName &&
    previous.onRowOpen === next.onRowOpen &&
    previous.nonClickableColumns === next.nonClickableColumns &&
    previous.className === next.className
  )
}

export const VirtualRow = memo(VirtualRowInner, arePropsEqual) as <TData>(
  props: VirtualRowProps<TData>,
) => ReactNode
