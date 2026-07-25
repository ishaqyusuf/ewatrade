"use client"

import type { ReactNode } from "react"
import { GlobalSheets } from "./global-sheets"

export function GlobalSheetsProvider({
  children,
  store,
}: {
  children: ReactNode
  store: { id: string; name: string }
}) {
  return (
    <>
      {children}
      <GlobalSheets store={store} />
    </>
  )
}
