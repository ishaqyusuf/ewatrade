"use client"

import type { ReactNode } from "react"

/** Catalog tokens follow the dashboard theme, including portalled sheets. */
export function CatalogAppearance({ children }: { children: ReactNode }) {
  return (
    <div className="catalog-theme flex min-h-0 flex-1 flex-col bg-background text-foreground">
      {children}
    </div>
  )
}

export function useCatalogThemeClass() {
  return "catalog-theme"
}
