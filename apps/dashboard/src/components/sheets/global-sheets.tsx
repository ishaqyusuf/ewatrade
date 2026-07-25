"use client"

import { DomainSheet } from "./domain-sheet"

export function GlobalSheets({
  store,
}: {
  store: { id: string; name: string }
}) {
  return <DomainSheet store={store} />
}
