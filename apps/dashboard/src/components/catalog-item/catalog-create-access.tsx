"use client"

import { type ReactNode, createContext, useContext } from "react"

const CatalogCreateAccessContext = createContext(false)

/** Whether the signed-in member may add Catalog items (the same gate as the Catalog page). */
export function CatalogCreateAccessProvider({
  allowed,
  children,
}: { allowed: boolean; children: ReactNode }) {
  return (
    <CatalogCreateAccessContext.Provider value={allowed}>
      {children}
    </CatalogCreateAccessContext.Provider>
  )
}

export function useCanCreateCatalogItems() {
  return useContext(CatalogCreateAccessContext)
}
