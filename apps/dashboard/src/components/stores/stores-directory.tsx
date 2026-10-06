"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { useStoreParams } from "@/hooks/use-store-params"
import { useTRPC } from "@/trpc/client"
import { Badge, Button, Skeleton } from "@ewatrade/ui"
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

export function StoresDirectory() {
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
            <Button onClick={() => void setCreateOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
              Add Store
            </Button>
          }
        />
      </PageHeader>
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
        <div className="grid gap-4 sm:grid-cols-2">
          {stores.data.map((store) => (
            <article
              key={store.id}
              className="grid min-w-0 gap-4 border border-border p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="break-words text-base font-medium">
                  {store.name}
                </h2>
                <Badge variant="outline" className="shrink-0">
                  {store.status.toLowerCase()}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Currency: {store.currencyCode}
              </p>
            </article>
          ))}
        </div>
      )}
      <CreateStoreModal />
    </div>
  )
}
