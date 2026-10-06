"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { StoresDataTable } from "@/components/tables/stores/data-table"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { useStoreParams } from "@/hooks/use-store-params"
import { useTRPC } from "@/trpc/client"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import { Alert, AlertDescription, Button, Skeleton } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { CreateStoreModal } from "./create-store-modal"

export function StoresSkeleton() {
  return (
    <div aria-label="Loading Stores" className="grid gap-4 sm:grid-cols-2">
      {[0, 1].map((key) => (
        <Skeleton key={key} className="h-32 w-full" />
      ))}
    </div>
  )
}

export function StoresDirectory({
  initialViewSettings,
}: {
  initialViewSettings: DirectoryViewSettings
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "stores",
      queryKey: "storeView",
      initialSettings: initialViewSettings,
    })
  const trpc = useTRPC()
  const stores = useQuery(trpc.tenant.stores.queryOptions())
  const { setCreateOpen } = useStoreParams()
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Stores"
        description="Manage your business locations. Choose these Stores in catalog, inventory and staff forms."
      >
        <PageToolbar
          actions={
            <>
              <ViewSwitcher
                label="Store view"
                value={view}
                options={directoryViewOptions}
                onValueChange={setView}
              />
              <Button onClick={() => void setCreateOpen(true)}>
                <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
                Add Store
              </Button>
            </>
          }
        />
      </PageHeader>
      {persistenceError ? (
        <Alert appearance="dashboard" role="alert">
          <AlertDescription>{persistenceError}</AlertDescription>
          <Button variant="outline" size="sm" onClick={retryPersistence}>
            Retry saving view
          </Button>
        </Alert>
      ) : null}
      {stores.isPending ? (
        <StoresSkeleton />
      ) : stores.isError ? (
        <div className="grid justify-items-start gap-3">
          <FormFeedback appearance="dashboard">
            Could not load Stores. {stores.error.message}
          </FormFeedback>
          <Button variant="outline" onClick={() => void stores.refetch()}>
            Try again
          </Button>
        </div>
      ) : stores.data.length === 0 ? (
        <div className="border p-6 text-sm text-muted-foreground">
          No Stores yet. Add your first Store to get started.
        </div>
      ) : (
        <StoresDataTable stores={stores.data} view={view} />
      )}
      <CreateStoreModal />
    </div>
  )
}
