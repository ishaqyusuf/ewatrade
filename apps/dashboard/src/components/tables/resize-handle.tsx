"use client"

import { cn } from "@/utils"
import type { Header } from "@tanstack/react-table"
import type { KeyboardEvent, MouseEvent, TouchEvent } from "react"

export interface ResizeHandleProps<TData> {
  header: Header<TData, unknown>
  className?: string
  step?: number
}

/** Pointer, touch, and keyboard resize control for a TanStack header. */
export function ResizeHandle<TData>({
  header,
  className,
  step = 16,
}: ResizeHandleProps<TData>) {
  const column = header.column
  if (!column.getCanResize()) return null

  function resizeWithPointer(
    event: MouseEvent<HTMLButtonElement> | TouchEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation()
    header.getResizeHandler()(event.nativeEvent)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Home") {
      event.preventDefault()
      event.stopPropagation()
      column.resetSize()
      return
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return

    event.preventDefault()
    event.stopPropagation()
    const direction = event.key === "ArrowRight" ? 1 : -1
    const delta = direction * step * (event.shiftKey ? 4 : 1)
    const nextSize = Math.min(
      column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER,
      Math.max(column.columnDef.minSize ?? 20, column.getSize() + delta),
    )
    header.getContext().table.setColumnSizing((currentSizing) => ({
      ...currentSizing,
      [column.id]: nextSize,
    }))
  }

  return (
    <button
      type="button"
      role="separator"
      aria-label={`Resize ${column.id} column`}
      aria-orientation="vertical"
      aria-valuemin={column.columnDef.minSize ?? 20}
      aria-valuemax={column.columnDef.maxSize ?? 1000}
      aria-valuenow={column.getSize()}
      title="Drag to resize; use arrow keys to adjust; Home resets"
      tabIndex={0}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        column.resetSize()
      }}
      onMouseDown={resizeWithPointer}
      onTouchStart={resizeWithPointer}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}
      className={cn(
        "absolute right-0 top-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize touch-none select-none rounded-sm outline-none hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  )
}
