"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { PageHeader, PageToolbar } from "@/components/page-header"
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
  storeName,
  view,
  onViewChange,
}: {
  canManageSetup: boolean
  storeId: string
  storeName: string
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  const trpc = useTRPC()
  const context = useQuery(
    trpc.prescriptions.queueContext.queryOptions({ storeId }),
  )
  const readiness = context.data?.readiness
  return (
    <PageHeader
      eyebrow={storeName}
      title="Prescription requests"
      description="Review private intake, verify transcription, and prepare a pharmacy-approved quote."
    >
      <p className="text-sm" aria-live="polite">
        <span className="font-medium">Readiness:</span>{" "}
        {context.isLoading
          ? "Checking…"
          : readiness?.ready
            ? context.data?.status === "active"
              ? "Active"
              : "Ready to activate"
            : `Needs ${readiness?.missing.join(", ").replaceAll("_", " ") ?? "setup review"}`}
      </p>
      {context.error ? (
        <FormFeedback appearance="dashboard">
          Readiness could not be loaded. Refresh to try again.
        </FormFeedback>
      ) : null}
      <PageToolbar
        actions={
          <>
            <ViewSwitcher
              label="Prescription view"
              value={view}
              options={directoryViewOptions}
              onValueChange={onViewChange}
            />
            <Button
              render={<Link href="/prescriptions/reports" />}
              variant="outline"
              className="h-9 rounded-none"
            >
              Reports
            </Button>
            {canManageSetup ? (
              <Button
                render={<Link href="/settings/compliance" />}
                variant="outline"
                className="h-9 rounded-none"
              >
                Compliance
              </Button>
            ) : null}
            <OpenPrescriptionSheet />
          </>
        }
      >
        <PrescriptionSearchFilter storeId={storeId} />
      </PageToolbar>
      {context.data?.activeBreakGlass ? (
        <FormFeedback appearance="dashboard">
          Emergency access is active until{" "}
          {context.data.activeBreakGlass.expiresAt?.toLocaleTimeString()}. Every
          sensitive read is conspicuously logged and requires post-use review.
        </FormFeedback>
      ) : null}
    </PageHeader>
  )
}
