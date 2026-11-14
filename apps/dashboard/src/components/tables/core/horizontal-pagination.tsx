"use client"

import { Button, cn } from "@ewatrade/ui"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

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
    <div className={cn("flex shrink-0 items-center gap-0.5", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:bg-[var(--hover,var(--muted))] disabled:opacity-30"
        aria-label="Scroll table left"
        disabled={!canScrollLeft}
        onClick={() => onScrollLeft()}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-[18px]" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:bg-[var(--hover,var(--muted))] disabled:opacity-30"
        aria-label="Scroll table right"
        disabled={!canScrollRight}
        onClick={() => onScrollRight()}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-[18px]" />
      </Button>
    </div>
  )
}
