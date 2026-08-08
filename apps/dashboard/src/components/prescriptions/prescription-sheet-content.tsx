"use client"

import { usePrescriptionParams } from "@/hooks/use-prescription-params"

import { PrescriptionFormContext } from "./form-context"
import { PrescriptionIntakeForm } from "./prescription-intake-form"
import { PrescriptionRequestWorkspace } from "./prescription-request-workspace"

export function PrescriptionSheetContent({ storeId }: { storeId: string }) {
  const { prescriptionId, sheet } = usePrescriptionParams()
  if (sheet === "intake") {
    return (
      <PrescriptionFormContext>
        <PrescriptionIntakeForm storeId={storeId} />
      </PrescriptionFormContext>
    )
  }
  if (prescriptionId) {
    return (
      <PrescriptionRequestWorkspace
        requestId={prescriptionId}
        storeId={storeId}
      />
    )
  }
  return (
    <p className="text-sm text-muted-foreground">
      Select a Prescription Request to continue.
    </p>
  )
}
