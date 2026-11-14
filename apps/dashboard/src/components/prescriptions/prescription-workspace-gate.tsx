"use client"

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
      <div className="grid min-w-0 flex-1 gap-4 pt-4" aria-busy="true">
        <div className="h-11 animate-pulse rounded-[var(--ui-radius-control)] bg-muted" />
        <div className="h-72 animate-pulse rounded-[var(--ui-radius-surface)] bg-muted" />
      </div>
    )
  }

  if (accessState === "setup_required") {
    return (
      <div className="grid min-w-0 flex-1 content-start gap-4 pt-4">
        <section className="grid max-w-2xl justify-items-start gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Finish pharmacy setup</h2>
          <p className="text-sm text-muted-foreground">
            Add a verified pharmacist and an attendant, and choose pickup or
            delivery. Prescriptions stay closed until then.
          </p>
          <Button render={<Link href="/settings/compliance" />}>
            Continue setup
          </Button>
        </section>
      </div>
    )
  }

  if (accessState !== "ready") {
    return (
      <div className="flex min-h-[60vh] min-w-0 items-center justify-center pt-4">
        <section className="grid w-full max-w-md justify-items-center gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card p-6 text-center">
          <h2 className="text-lg font-semibold">
            {accessState === "forbidden"
              ? "You need a pharmacy role"
              : "Prescriptions didn’t load"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {accessState === "forbidden"
              ? "Ask the owner to give you a pharmacist or attendant role."
              : "Nothing was changed. Try again."}
          </p>
          {accessState === "error" ? (
            <Button onClick={retryWorkspace}>Try again</Button>
          ) : null}
        </section>
      </div>
    )
  }

  return children
}
