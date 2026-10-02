"use client"

import { usePrescriptionParams } from "@/hooks/use-prescription-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function OpenPrescriptionSheet() {
  const { setParams } = usePrescriptionParams()
  return (
    <Button
      type="button"
      variant="outline"
      className="size-9 rounded-none"
      aria-label="New intake"
      onClick={() => setParams({ prescriptionSheet: "intake" })}
    >
      <HugeiconsIcon icon={Add01Icon} className="size-4" />
    </Button>
  )
}
