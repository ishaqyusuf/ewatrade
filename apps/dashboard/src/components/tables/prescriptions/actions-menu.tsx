"use client"

import type { PrescriptionRequestStatus } from "@ewatrade/prescriptions/schemas"
import { Button } from "@ewatrade/ui"
import type { MouseEvent } from "react"

export function PrescriptionActionsMenu({
  onOpen,
  requestId,
  status,
}: {
  onOpen: (requestId: string, status: PrescriptionRequestStatus) => void
  requestId: string
  status: PrescriptionRequestStatus
}) {
  return (
    <Button
      appearance="form"
      type="button"
      data-row-interactive="true"
      aria-label={`Open prescription ${requestId}`}
      size="sm"
      variant="ghost"
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        onOpen(requestId, status)
      }}
    >
      Open
    </Button>
  )
}
