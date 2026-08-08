"use client"

import { usePrescriptionFilterParams } from "@/hooks/use-prescription-filter-params"
import { usePrescriptionParams } from "@/hooks/use-prescription-params"
import { Button } from "@ewatrade/ui"

export function PrescriptionEmptyState() {
  const { setParams } = usePrescriptionParams()
  return (
    <div className="flex min-h-56 flex-col items-center justify-center text-center">
      <p className="font-medium">No prescription requests</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Start staff-assisted intake or share the store's secure prescription
        link.
      </p>
      <Button
        className="mt-4"
        variant="outline"
        onClick={() => setParams({ prescriptionSheet: "intake" })}
      >
        New intake
      </Button>
    </div>
  )
}

export function PrescriptionNoResults() {
  const { setFilter } = usePrescriptionFilterParams()
  return (
    <div className="flex min-h-56 flex-col items-center justify-center text-center">
      <p className="font-medium">No matching requests</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Change the search or clear the filters.
      </p>
      <Button
        className="mt-4"
        variant="outline"
        onClick={() => setFilter(null)}
      >
        Clear filters
      </Button>
    </div>
  )
}
