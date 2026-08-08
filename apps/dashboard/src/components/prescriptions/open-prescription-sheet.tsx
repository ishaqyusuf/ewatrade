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
      onClick={() => setParams({ prescriptionSheet: "intake" })}
    >
      <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
      New intake
    </Button>
  )
}
