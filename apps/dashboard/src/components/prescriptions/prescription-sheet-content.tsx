"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import {
  prescriptionSheetModeForStatus,
  usePrescriptionParams,
} from "@/hooks/use-prescription-params"
import { useTRPC } from "@/trpc/client"
import type { PrescriptionRequestStatus } from "@ewatrade/prescriptions/schemas"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  PrescriptionFormContext,
  PrescriptionWorkspaceFormContext,
} from "./form-context"
import { PrescriptionIntakeForm } from "./prescription-intake-form"
import { PrescriptionRequestWorkspace } from "./prescription-request-workspace"
import { prescriptionWorkspaceAccessState } from "./prescription-workspace-access"
import { prescriptionWorkspaceScopeKey } from "./prescription-workspace-scope"

export function PrescriptionSheetContent({
  canManageSetup,
  closeError,
  storeId,
}: {
  canManageSetup: boolean
  closeError: string | null
  storeId: string
}) {
  const trpc = useTRPC()
  const { prescriptionId, setParams, sheet } = usePrescriptionParams()
  const open = Boolean(sheet)
  const access = useQuery(
    trpc.prescriptions.workspaceAccess.queryOptions(
      { storeId },
      { enabled: open, retry: false },
    ),
  )
  const context = useQuery(
    trpc.prescriptions.queueContext.queryOptions(
      { storeId },
      { enabled: open && access.data?.canAccess === true, retry: false },
    ),
  )
  const accessState = prescriptionWorkspaceAccessState({
    canManageSetup,
    hasError: Boolean(access.error || context.error),
    isDenied:
      access.data?.canAccess === false ||
      context.error?.data?.code === "FORBIDDEN",
    isLoading: access.isLoading || context.isLoading,
  })

  function retryWorkspace() {
    if (access.error) void access.refetch()
    if (context.error) void context.refetch()
  }

  const title =
    sheet === "intake" ? "Staff-assisted intake" : "Prescription request"
  const description =
    sheet === "intake"
      ? "Capture only the details needed for pharmacy review."
      : "Sensitive media access is short-lived and audited."

  let content = null
  if (accessState === "loading") {
    content = <div aria-busy="true" className="h-32 animate-pulse bg-muted" />
  } else if (accessState === "setup_required") {
    content = (
      <section className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <h2 className="font-semibold">Professional access is not ready</h2>
        <p className="text-sm leading-6">
          Complete the pharmacy policy and professional role checks before
          opening the private prescription queue.
        </p>
        <Button
          appearance="form"
          className="w-fit"
          render={<Link href="/settings/compliance" />}
        >
          Continue compliance setup
        </Button>
      </section>
    )
  } else if (accessState !== "ready") {
    content = (
      <section className="grid gap-3 rounded-xl border border-border p-5 text-center">
        <h2 className="font-semibold">
          {accessState === "forbidden"
            ? "Professional access is required"
            : "Prescription workspace unavailable"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {accessState === "forbidden"
            ? "Ask an Owner or Admin to assign your verified pharmacy role."
            : "We could not load this workspace. Try again."}
        </p>
        {accessState === "error" ? (
          <Button
            appearance="form"
            className="mx-auto"
            onClick={retryWorkspace}
          >
            Try again
          </Button>
        ) : null}
      </section>
    )
  } else if (sheet === "intake") {
    content = (
      <PrescriptionFormContext key={storeId}>
        <PrescriptionIntakeForm storeId={storeId} />
      </PrescriptionFormContext>
    )
  } else if (sheet === "success" && prescriptionId) {
    content = (
      <PrescriptionRequestSuccess
        requestId={prescriptionId}
        storeId={storeId}
        onView={(status) =>
          setParams({
            prescriptionSheet: prescriptionSheetModeForStatus(status),
          })
        }
      />
    )
  } else if (prescriptionId) {
    content = (
      <PrescriptionWorkspaceFormContext
        key={prescriptionWorkspaceScopeKey(storeId, prescriptionId)}
      >
        <PrescriptionRequestWorkspace
          mode={sheet ?? "details"}
          requestId={prescriptionId}
          storeId={storeId}
        />
      </PrescriptionWorkspaceFormContext>
    )
  } else {
    content = (
      <p className="text-sm text-muted-foreground">
        Select a Prescription Request to continue.
      </p>
    )
  }

  return (
    <SheetFrame title={title} description={description}>
      {closeError ? (
        <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
      ) : null}
      {content}
    </SheetFrame>
  )
}

function PrescriptionRequestSuccess({
  onView,
  requestId,
  storeId,
}: {
  onView: (
    status: PrescriptionRequestStatus | Uppercase<PrescriptionRequestStatus>,
  ) => void
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
      <FormFeedback appearance="dashboard">
        This request is unavailable or you no longer have access.
      </FormFeedback>
    )
  }
  return (
    <output className="grid gap-4">
      <h3 className="text-lg font-semibold">Request created</h3>
      <p className="text-sm text-muted-foreground">
        {detail.data.reference} is in the pharmacy queue and will follow the
        same media, transcription, and pharmacist gates as every other channel.
      </p>
      <Button
        appearance="form"
        variant="outline"
        type="button"
        onClick={() => onView(detail.data.status)}
      >
        View request
      </Button>
    </output>
  )
}
