"use client"

import { DomainHeader } from "@/components/domains/domain-header"
import { DirectoryCollectionSkeleton } from "@/components/tables/core"
import { DomainDataTable } from "@/components/tables/domains/data-table"
import { DomainTableSkeleton } from "@/components/tables/domains/skeleton"
import { useDirectoryView } from "@/hooks/use-directory-view"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { Suspense } from "react"

export function DomainsDirectory({
  storeName,
  initialViewSettings,
}: {
  storeName: string
  initialViewSettings: DirectoryViewSettings
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "domains",
      queryKey: "domainView",
      initialSettings: initialViewSettings,
    })
  return (
    <>
      <DomainHeader storeName={storeName} view={view} onViewChange={setView} />
      {persistenceError ? (
        <Alert appearance="dashboard" role="alert">
          <AlertDescription>{persistenceError}</AlertDescription>
          <Button variant="outline" size="sm" onClick={retryPersistence}>
            Retry saving view
          </Button>
        </Alert>
      ) : null}
      <Suspense
        fallback={
          view === "table" ? (
            <DomainTableSkeleton />
          ) : (
            <DirectoryCollectionSkeleton label="domains" />
          )
        }
      >
        <DomainDataTable view={view} />
      </Suspense>
    </>
  )
}
