"use client"

import { cn } from "@/utils"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { AriaAttributes, CSSProperties, ReactNode } from "react"

export interface DraggableHeaderProps {
  id: string
  children: ReactNode
  className?: string
  style?: CSSProperties
  disabled?: boolean
  sticky?: boolean
  stickySide?: "left" | "right"
  ariaSort?: AriaAttributes["aria-sort"]
}

/** Sortable header with a dedicated, keyboard-accessible drag grip. */
export function DraggableHeader({
  id,
  children,
  className,
  style,
  disabled = false,
  sticky = false,
  stickySide = "left",
  ariaSort,
}: DraggableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  return (
    <th
      ref={setNodeRef}
      scope="col"
      aria-sort={ariaSort}
      data-table-column-id={id}
      data-table-sticky={sticky ? "true" : undefined}
      data-table-sticky-side={sticky ? stickySide : undefined}
      className={cn(
        "group/header relative flex h-full min-w-0 select-none items-center border-b border-border px-4",
        isDragging && "z-50 border border-border bg-background shadow-sm",
        className,
      )}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        ...style,
      }}
    >
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
      {!disabled ? (
        <button
          type="button"
          aria-label={`Reorder ${id} column`}
          title="Drag to reorder"
          className="ml-1 inline-flex size-6 shrink-0 touch-none items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing md:cursor-grab"
          {...attributes}
          {...listeners}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <circle cx="5" cy="3" r="1" />
            <circle cx="11" cy="3" r="1" />
            <circle cx="5" cy="8" r="1" />
            <circle cx="11" cy="8" r="1" />
            <circle cx="5" cy="13" r="1" />
            <circle cx="11" cy="13" r="1" />
          </svg>
        </button>
      ) : null}
    </th>
  )
}
