"use client"

import { Button } from "@ewatrade/ui"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export type FilterChip = {
  id: string
  label: string
  onRemove: () => void
}

export function FilterList({
  filters,
  onClear,
}: {
  filters: FilterChip[]
  onClear?: () => void
}) {
  if (!filters.length) return null
  return (
    <ul aria-label="Active filters" className="flex min-w-0 flex-wrap gap-2">
      {filters.map((filter) => (
        <li key={filter.id} className="min-w-0 max-w-full">
          <Button
            type="button"
            variant="secondary"
            aria-label={`Remove ${filter.label} filter`}
            className="group h-9 max-w-full rounded-none bg-secondary px-2 font-normal text-[#878787] hover:bg-secondary"
            onClick={filter.onRemove}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              className="size-3 shrink-0 sm:w-0 sm:scale-0 sm:transition-all sm:group-hover:w-3 sm:group-hover:scale-100 sm:group-focus-visible:w-3 sm:group-focus-visible:scale-100"
            />
            <span className="truncate">{filter.label}</span>
          </Button>
        </li>
      ))}
      {onClear ? (
        <li>
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-none px-2 font-normal text-muted-foreground"
            onClick={onClear}
          >
            Clear filters
          </Button>
        </li>
      ) : null}
    </ul>
  )
}
