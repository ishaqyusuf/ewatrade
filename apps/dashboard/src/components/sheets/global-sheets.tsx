"use client"

import { DomainSheet } from "./domain-sheet"
import { PrescriptionRequestSheet } from "./prescription-request-sheet"

export function GlobalSheets({
  store,
}: {
  store: { id: string; name: string }
}) {
  return (
    <>
      <DomainSheet store={store} />
      <PrescriptionRequestSheet storeId={store.id} />
    </>
  )
}
