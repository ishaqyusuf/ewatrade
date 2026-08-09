"use client"

import { useTRPC } from "@/trpc/client"
import Link from "next/link"

import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

import { OpenPrescriptionSheet } from "./open-prescription-sheet"
import { PrescriptionSearchFilter } from "./prescription-search-filter"

export function PrescriptionHeader({
  storeId,
  storeName,
}: {
  storeId: string
  storeName: string
}) {
  const trpc = useTRPC()
  const context = useQuery(
    trpc.prescriptions.queueContext.queryOptions({ storeId }),
  )
  const readiness = context.data?.readiness
  return (
    <header className="grid gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{storeName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Prescription requests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review private intake, verify transcription, and prepare a
            pharmacy-approved quote.
          </p>
          <p className="mt-2 text-sm" aria-live="polite">
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
            <p role="alert" className="mt-1 text-sm text-destructive">
              Readiness could not be loaded. Refresh to try again.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            render={<Link href="/prescriptions/reports" />}
            variant="outline"
          >
            Reports
          </Button>
          <Button
            render={<Link href="/settings/prescriptions" />}
            variant="outline"
          >
            Setup
          </Button>
          <OpenPrescriptionSheet />
        </div>
      </div>
      <PrescriptionSearchFilter storeId={storeId} />
      {context.data?.activeBreakGlass ? (
        <p
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-950"
          role="alert"
        >
          Emergency access is active until{" "}
          {context.data.activeBreakGlass.expiresAt?.toLocaleTimeString()}. Every
          sensitive read is conspicuously logged and requires post-use review.
        </p>
      ) : null}
    </header>
  )
}
