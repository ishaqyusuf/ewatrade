"use client"

import { usePrescriptionParams } from "@/hooks/use-prescription-params"

import { PrescriptionFormContext } from "./form-context"
import { PrescriptionIntakeForm } from "./prescription-intake-form"
import { PrescriptionRequestWorkspace } from "./prescription-request-workspace"

export function PrescriptionSheetContent({ storeId }: { storeId: string }) {
  const { prescriptionId, setParams, sheet } = usePrescriptionParams()
  if (sheet === "intake") {
    return (
      <PrescriptionFormContext>
        <PrescriptionIntakeForm storeId={storeId} />
      </PrescriptionFormContext>
    )
  }
  if (sheet === "success" && prescriptionId) {
    return (
      <output className="grid gap-4">
        <h3 className="text-lg font-semibold">Request created</h3>
        <p className="text-sm text-muted-foreground">
          The private intake is in the pharmacy queue and will follow the same
          media, transcription, and pharmacist gates as every other channel.
        </p>
        <button
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium"
          type="button"
          onClick={() => setParams({ prescriptionSheet: "details" })}
        >
          View request
        </button>
      </output>
    )
  }
  if (prescriptionId) {
    return (
      <PrescriptionRequestWorkspace
        mode={sheet ?? "details"}
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
