"use client"

import type { TableColumnMeta } from "@/components/tables/core"
import {
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import type { Table } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"

export interface UseTableDndOptions {
  /** Additional fixed columns, such as a domain's primary identity column. */
  fixedColumnIds?: readonly string[]
}

const ALWAYS_FIXED_COLUMNS = new Set(["select", "actions"])
const NO_FIXED_COLUMN_IDS: readonly string[] = []

/** Column reordering is limited to sortable ids; pinned/fixed columns keep their slots. */
export function useTableDnd<TData>(
  table: Table<TData>,
  { fixedColumnIds = NO_FIXED_COLUMN_IDS }: UseTableDndOptions = {},
) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const fixedIds = useMemo(
    () => new Set([...ALWAYS_FIXED_COLUMNS, ...fixedColumnIds]),
    [fixedColumnIds],
  )
  const visibleColumns = table.getVisibleLeafColumns()
  const sortableColumnIds = useMemo(
    () =>
      visibleColumns
        .filter((column) => {
          const meta = column.columnDef.meta as TableColumnMeta | undefined
          return (
            !fixedIds.has(column.id) &&
            !meta?.sticky &&
            meta?.reorderable !== false
          )
        })
        .map((column) => column.id),
    [fixedIds, visibleColumns],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (
        !over ||
        active.id === over.id ||
        !sortableColumnIds.includes(String(active.id)) ||
        !sortableColumnIds.includes(String(over.id))
      ) {
        return
      }

      const currentOrder = table.getState().columnOrder.length
        ? [...table.getState().columnOrder]
        : table.getAllLeafColumns().map((column) => column.id)
      const currentSortableIds = currentOrder.filter((id) =>
        sortableColumnIds.includes(id),
      )
      const oldIndex = currentSortableIds.indexOf(String(active.id))
      const newIndex = currentSortableIds.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0) return

      const nextSortableIds = arrayMove(currentSortableIds, oldIndex, newIndex)
      let nextIndex = 0
      table.setColumnOrder(
        currentOrder.map((id) =>
          sortableColumnIds.includes(id)
            ? (nextSortableIds[nextIndex++] ?? id)
            : id,
        ),
      )
    },
    [sortableColumnIds, table],
  )

  return { sensors, handleDragEnd, sortableColumnIds }
}
