"use client"

import {
  prescriptionSheetModeForStatus,
  usePrescriptionParams,
} from "@/hooks/use-prescription-params"
import type { PrescriptionRequestStatus } from "@ewatrade/prescriptions/schemas"
import { Button } from "@ewatrade/ui"
import type { MouseEvent } from "react"

export function PrescriptionActionsMenu({
  requestId,
  status,
}: {
  requestId: string
  status: PrescriptionRequestStatus
}) {
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
          prescriptionSheet: prescriptionSheetModeForStatus(status),
        })
      }}
    >
      Open
    </Button>
  )
}
