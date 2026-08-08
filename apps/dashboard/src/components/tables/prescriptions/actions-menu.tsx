"use client"

import { usePrescriptionParams } from "@/hooks/use-prescription-params"
import { Button } from "@ewatrade/ui"
import type { MouseEvent } from "react"

export function PrescriptionActionsMenu({ requestId }: { requestId: string }) {
  const { setParams } = usePrescriptionParams()
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        setParams({
          prescriptionId: requestId,
          prescriptionSheet: "details",
        })
      }}
    >
      Open
    </Button>
  )
}
