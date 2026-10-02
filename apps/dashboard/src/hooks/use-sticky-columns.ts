"use client"

import type { StickyColumnConfig } from "@/components/tables/core"
import { cn } from "@/utils"
import type { Table } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"
import type { CSSProperties } from "react"

interface UseStickyColumnsProps<TData> {
  table?: Table<TData>
  stickyColumns?: readonly StickyColumnConfig[]
  /** Allows skeleton headers to remain visible before data is available. */
  loading?: boolean
}

interface StickyPosition {
  side: "left" | "right"
  offset: number
}

/** Computes pinned offsets from currently visible, live-sized table columns. */
export function useStickyColumns<TData>({
  table,
  stickyColumns = [],
  loading = false,
}: UseStickyColumnsProps<TData>) {
  const visibilityState = table?.getState().columnVisibility
  const sizingState = table?.getState().columnSizing

  // The TanStack table instance is stable, so its state snapshots are the
  // invalidation signals needed to keep virtual rows memoized between changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: TanStack's table ref is stable across controlled-state updates.
  const stickyPositions = useMemo(() => {
    const positions: Record<string, StickyPosition> = {}
    const configuredVisible = stickyColumns.filter((config) => {
      const column = table?.getColumn(config.id)
      return loading || (column ? column.getIsVisible() : !table)
    })

    for (const side of ["left", "right"] as const) {
      let offset = 0
      const sideColumns = configuredVisible.filter(
        (config) => (config.side ?? "left") === side,
      )
      for (const config of sideColumns) {
        const column = table?.getColumn(config.id)
        const width = column?.getSize() ?? config.width ?? 0
        positions[config.id] = { side, offset }
        offset += width
      }
    }

    return positions
  }, [loading, table, stickyColumns, visibilityState, sizingState])

  const stickyIds = useMemo(
    () => new Set(stickyColumns.map(({ id }) => id)),
    [stickyColumns],
  )

  const getStickyStyle = useCallback(
    (columnId: string): CSSProperties => {
      const position = stickyPositions[columnId]
      if (!position) return {}
      // Headers stay relative for resize handles on mobile. An inline `left`
      // would move them even when pinning is disabled below the md breakpoint.
      const style: CSSProperties & { "--table-sticky-offset": string } = {
        "--table-sticky-offset": `${position.offset}px`,
      }
      return style
    },
    [stickyPositions],
  )

  const getStickyClassName = useCallback(
    (columnId: string, baseClassName?: string) =>
      cn(
        baseClassName,
        stickyIds.has(columnId) && "md:sticky",
        stickyPositions[columnId]?.side === "left" &&
          "md:left-[var(--table-sticky-offset)]",
        stickyPositions[columnId]?.side === "right" &&
          "md:right-[var(--table-sticky-offset)]",
      ),
    [stickyIds, stickyPositions],
  )

  const isVisible = useCallback(
    (columnId: string) => {
      const column = table?.getColumn(columnId)
      return loading || (column ? column.getIsVisible() : true)
    },
    [loading, table],
  )

  return { stickyPositions, getStickyStyle, getStickyClassName, isVisible }
}
