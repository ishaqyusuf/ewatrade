import Link from "next/link"

import { Button } from "@ewatrade/ui"

import { OpenPrescriptionSheet } from "./open-prescription-sheet"
import { PrescriptionSearchFilter } from "./prescription-search-filter"

export function PrescriptionHeader({
  storeName,
}: {
  storeName: string
}) {
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
      <PrescriptionSearchFilter />
    </header>
  )
}
