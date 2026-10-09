"use client"

import { PageHeader } from "@/components/page-header"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import type { ReactNode } from "react"

import { prescriptionWorkspaceAccessState } from "./prescription-workspace-access"

export function PrescriptionWorkspaceGate({
  canManageSetup,
  children,
  store,
}: {
  canManageSetup: boolean
  children: ReactNode
  store: { id: string; name: string }
}) {
  const trpc = useTRPC()
  const setup = useQuery(
    trpc.prescriptions.setup.queryOptions(
      { storeId: store.id },
      { enabled: canManageSetup, retry: false },
    ),
  )
  const operationalAccess = useQuery(
    trpc.prescriptions.workspaceAccess.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const context = useQuery(
    trpc.prescriptions.queueContext.queryOptions(
      { storeId: store.id },
      { enabled: operationalAccess.data?.canAccess === true, retry: false },
    ),
  )
  const accessState = prescriptionWorkspaceAccessState({
    canManageSetup,
    hasError: Boolean(setup.error || operationalAccess.error || context.error),
    isDenied:
      operationalAccess.data?.canAccess === false ||
      context.error?.data?.code === "FORBIDDEN",
    isLoading:
      setup.isLoading || operationalAccess.isLoading || context.isLoading,
  })

  const retryWorkspace = () => {
    if (setup.error) void setup.refetch()
    if (operationalAccess.error) void operationalAccess.refetch()
    if (context.error) void context.refetch()
  }

  if (accessState === "loading") {
    return (
      <div className="grid min-w-0 flex-1 gap-4 pt-6" aria-busy="true">
        <div className="h-24 animate-pulse bg-muted" />
        <div className="h-72 animate-pulse bg-muted" />
      </div>
    )
  }

  if (accessState === "setup_required") {
    return (
      <div className="grid min-w-0 flex-1 content-start gap-6 pt-6">
        <PageHeader
          eyebrow={store.name}
          title="Pharmacy compliance setup"
          description="Complete the pharmacy policy and professional role checks before opening the private prescription queue."
        />
        <section className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="font-semibold">Professional access is not ready</h2>
          <p className="mt-2 text-sm leading-6">
            Assign a verified pharmacist and an attendant, configure pickup or
            delivery, and activate the Store. Patient request data remains
            closed until those checks pass.
          </p>
          <Button
            appearance="form"
            className="mt-5"
            render={<Link href="/settings/compliance" />}
          >
            Continue compliance setup
          </Button>
        </section>
      </div>
    )
  }

  if (accessState !== "ready") {
    return (
      <div className="flex min-h-[60vh] min-w-0 items-center justify-center pt-6">
        <section className="w-full max-w-md rounded-xl border bg-background p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Prescription workspace unavailable
          </p>
          <h1 className="mt-2 text-xl font-semibold">
            {accessState === "forbidden"
              ? "Professional access is required"
              : "We could not load this workspace"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {accessState === "forbidden"
              ? "Ask an Owner or Admin to assign your verified pharmacy role."
              : "Your data has not been changed. Try loading the workspace again."}
          </p>
          {accessState === "error" ? (
            <Button appearance="form" className="mt-6" onClick={retryWorkspace}>
              Try again
            </Button>
          ) : null}
        </section>
      </div>
    )
  }

  return children
}
