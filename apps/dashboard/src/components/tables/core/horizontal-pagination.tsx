"use client"

import { Button, cn } from "@ewatrade/ui"

export interface HorizontalPaginationProps {
  canScrollLeft: boolean
  canScrollRight: boolean
  onScrollLeft: () => void
  onScrollRight: () => void
  className?: string
}

export function HorizontalPagination({
  canScrollLeft,
  canScrollRight,
  onScrollLeft,
  onScrollRight,
  className,
}: HorizontalPaginationProps) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        className="rounded-none"
        aria-label="Scroll table left"
        disabled={!canScrollLeft}
        onClick={() => onScrollLeft()}
      >
        <span aria-hidden="true">←</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        className="rounded-none"
        aria-label="Scroll table right"
        disabled={!canScrollRight}
        onClick={() => onScrollRight()}
      >
        <span aria-hidden="true">→</span>
      </Button>
    </div>
  )
}
