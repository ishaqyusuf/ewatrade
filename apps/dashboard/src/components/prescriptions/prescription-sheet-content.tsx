"use client"

import { usePrescriptionParams } from "@/hooks/use-prescription-params"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"

import {
  PrescriptionFormContext,
  PrescriptionWorkspaceFormContext,
} from "./form-context"
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
      <PrescriptionRequestSuccess
        requestId={prescriptionId}
        storeId={storeId}
        onView={() => setParams({ prescriptionSheet: "details" })}
      />
    )
  }
  if (prescriptionId) {
    return (
      <PrescriptionWorkspaceFormContext>
        <PrescriptionRequestWorkspace
          mode={sheet ?? "details"}
          requestId={prescriptionId}
          storeId={storeId}
        />
      </PrescriptionWorkspaceFormContext>
    )
  }
  return (
    <p className="text-sm text-muted-foreground">
      Select a Prescription Request to continue.
    </p>
  )
}

function PrescriptionRequestSuccess({
  onView,
  requestId,
  storeId,
}: {
  onView: () => void
  requestId: string
  storeId: string
}) {
  const trpc = useTRPC()
  const detail = useQuery(
    trpc.prescriptions.detail.queryOptions(
      { requestId, storeId },
      { retry: false },
    ),
  )
  if (detail.isLoading) return <div className="h-32 animate-pulse bg-muted" />
  if (detail.isError || !detail.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        This request is unavailable or you no longer have access.
      </p>
    )
  }
  return (
    <output className="grid gap-4">
      <h3 className="text-lg font-semibold">Request created</h3>
      <p className="text-sm text-muted-foreground">
        {detail.data.reference} is in the pharmacy queue and will follow the
        same media, transcription, and pharmacist gates as every other channel.
      </p>
      <button
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium"
        type="button"
        onClick={onView}
      >
        View request
      </button>
    </output>
  )
}
