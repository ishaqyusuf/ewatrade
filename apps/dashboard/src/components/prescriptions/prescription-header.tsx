"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { TableToolbarSlot } from "@/components/tables/core"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import Link from "next/link"

import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

import { OpenPrescriptionSheet } from "./open-prescription-sheet"
import { PrescriptionSearchFilter } from "./prescription-search-filter"

export function PrescriptionHeader({
  canManageSetup,
  storeId,
  view,
  onViewChange,
}: {
  canManageSetup: boolean
  storeId: string
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  const trpc = useTRPC()
  const context = useQuery(
    trpc.prescriptions.queueContext.queryOptions({ storeId }),
  )
  const readiness = context.data?.readiness
  const active = readiness?.ready && context.data?.status === "active"
  return (
    <header className="grid min-w-0 gap-4">
      {!context.isLoading && !active ? (
        <p className="text-sm" aria-live="polite">
          {readiness?.ready
            ? "Ready to switch on"
            : `Needs ${readiness?.missing.join(", ").replaceAll("_", " ") ?? "setup review"}`}
        </p>
      ) : null}
      {context.error ? (
        <FormFeedback appearance="dashboard">
          Readiness could not be loaded. Refresh to try again.
        </FormFeedback>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 sm:basis-72">
          <PrescriptionSearchFilter storeId={storeId} />
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:ml-auto">
          <div className="flex items-center gap-2 max-md:hidden">
            <TableToolbarSlot />
            <ViewSwitcher
              label="Prescription view"
              value={view}
              options={directoryViewOptions}
              onValueChange={onViewChange}
            />
          </div>
          <Button
            render={<Link href="/prescriptions/reports" />}
            variant="outline"
            className="max-sm:hidden"
          >
            Reports
          </Button>
          {canManageSetup ? (
            <Button
              render={<Link href="/settings/compliance" />}
              variant="outline"
              className="max-sm:hidden"
            >
              Compliance
            </Button>
          ) : null}
          <OpenPrescriptionSheet />
        </div>
      </div>
      {context.data?.activeBreakGlass ? (
        <FormFeedback appearance="dashboard">
          Emergency access is on until{" "}
          {context.data.activeBreakGlass.expiresAt?.toLocaleTimeString()}. Every
          private read is logged and must be reviewed afterwards.
        </FormFeedback>
      ) : null}
    </header>
  )
}
