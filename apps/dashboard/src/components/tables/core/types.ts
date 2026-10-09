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
  /** `end` right-aligns header, cells and skeleton, e.g. for money totals. */
  align?: "start" | "end"
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

/**
 * Quiet table chrome shared by every dashboard directory table: no outer box,
 * a full-strength rule under the header, hairline rules between rows.
 */
export const TABLE_SCROLL_CONTAINER_CLASS =
  "max-h-[560px] overflow-auto overscroll-contain"

/** Muted, small header labels; sort buttons inside inherit the same size. */
export const TABLE_HEADER_CELL_CLASS =
  "group/header relative flex h-full shrink-0 items-center border-r-0 border-b border-border px-4 text-xs font-normal text-muted-foreground [&_[data-slot=button]]:text-xs"

/** Hairline separator under body rows and skeleton rows. */
export const TABLE_ROW_RULE_CLASS = "border-b border-border/70"

/**
 * Left accent bar for the first cell of a row (`group` on the row): shown on
 * hover, keyboard focus and selection. The checkbox stays the selection signal.
 */
export const TABLE_ROW_ACCENT_CLASS =
  "shadow-[inset_3px_0_0_transparent] transition-shadow group-hover:shadow-[inset_3px_0_0_var(--primary)] group-focus-visible:shadow-[inset_3px_0_0_var(--primary)] group-aria-selected:shadow-[inset_3px_0_0_var(--primary)] group-data-[state=selected]:shadow-[inset_3px_0_0_var(--primary)] motion-reduce:transition-none"

export const ACTIONS_FULL_WIDTH_HEADER_CLASS =
  "group/header relative flex h-full items-center justify-center border-r-0 border-b border-border bg-background px-4"

export const ACTIONS_STICKY_HEADER_CLASS =
  "group/header relative flex h-full items-center justify-center border-r-0 border-b border-l border-border bg-background px-4 md:sticky md:right-0"

export const ACTIONS_FULL_WIDTH_CELL_CLASS =
  "bg-background group-hover:bg-muted/50"
