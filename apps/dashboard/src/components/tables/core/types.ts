import type { ColumnDef } from "@tanstack/react-table"
import type { RefCallback, RefObject } from "react"

export type SkeletonType =
  | "checkbox"
  | "text"
  | "avatar-text"
  | "icon-text"
  | "badge"
  | "tags"
  | "icon"

export const STANDARD_TABLE_ROW_HEIGHT = 45
export const TALL_TABLE_ROW_HEIGHT = 57

export interface SkeletonConfig {
  type: SkeletonType
  width?: string
}

/** Metadata shared by dashboard table headers, cells, and skeletons. */
export interface TableColumnMeta {
  className?: string
  headerLabel?: string
  reorderable?: boolean
  skeleton?: SkeletonConfig
  sortField?: string
  sticky?: boolean
}

/** A pinned column. Its current width comes from TanStack Table when available. */
export interface StickyColumnConfig {
  id: string
  side?: "left" | "right"
  /** Fallback width for skeletons or columns absent from the table instance. */
  width?: number
}

export interface TableScrollState {
  containerRef: RefObject<HTMLDivElement | null>
  /** Attach to the rendered scroll viewport so listeners survive pending/empty mounts. */
  setContainerRef: RefCallback<HTMLDivElement>
  canScrollLeft: boolean
  canScrollRight: boolean
  isScrollable: boolean
  scrollLeft: (smooth?: boolean) => void
  scrollRight: (smooth?: boolean) => void
}

/** Static display configuration; query and selection policy stay with consumers. */
export interface TableConfig {
  tableId: string
  stickyColumns: StickyColumnConfig[]
  nonReorderableColumns: ReadonlySet<string>
  rowHeight: number
}

export function getColumnId<TData>(column: ColumnDef<TData>): string {
  if (column.id) return column.id
  if ("accessorKey" in column && typeof column.accessorKey === "string") {
    return column.accessorKey
  }
  return ""
}

export function getHeaderLabel<TData>(column: ColumnDef<TData>): string {
  const meta = column.meta as TableColumnMeta | undefined
  if (meta?.headerLabel) return meta.headerLabel
  if (typeof column.header === "string") return column.header

  return getColumnId(column)
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase())
    .trim()
}

export const ACTIONS_FULL_WIDTH_HEADER_CLASS =
  "group/header relative flex h-full items-center justify-center border-t border-border bg-background px-4"

export const ACTIONS_STICKY_HEADER_CLASS =
  "group/header relative flex h-full items-center justify-center border-l border-t border-border bg-background px-4 md:sticky md:right-0"

export const ACTIONS_FULL_WIDTH_CELL_CLASS =
  "bg-background group-hover:bg-muted/50"
