"use client"

import {
  type PrescriptionFilters,
  usePrescriptionFilterParams,
} from "@/hooks/use-prescription-filter-params"
import { Button } from "@ewatrade/ui"

export function PrescriptionSortableHeader({
  field,
  label,
}: {
  field: NonNullable<PrescriptionFilters["sort"]>[0]
  label: string
}) {
  const { filter, setFilter } = usePrescriptionFilterParams()
  const active = filter.sort?.[0] === field
  const direction = active && filter.sort?.[1] === "asc" ? "desc" : "asc"
  return (
    <Button
      type="button"
      className="h-auto p-0 text-xs font-medium uppercase hover:bg-transparent"
      variant="ghost"
      onClick={() => setFilter({ sort: [field, direction] })}
    >
      {label}
      {active ? (filter.sort?.[1] === "asc" ? " ↑" : " ↓") : null}
    </Button>
  )
}
