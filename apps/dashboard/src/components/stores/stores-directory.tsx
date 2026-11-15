"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  SettingsHeader,
  SettingsPage,
} from "@/components/settings/settings-page"
import { SettingsStatusPill } from "@/components/settings/settings-status-pill"
import { useStoreParams } from "@/hooks/use-store-params"
import { useTRPC } from "@/trpc/client"
import { Button, Skeleton } from "@ewatrade/ui"
import {
  Add01Icon,
  ArrowRight01Icon,
  Store01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { StoreSheets } from "./store-sheet"

export function StoresSkeleton() {
  return (
    <div aria-label="Loading stores" className="grid gap-3">
      {[0, 1].map((key) => (
        <Skeleton key={key} className="h-16 w-full" />
      ))}
    </div>
  )
}

function statusLabel(status: string) {
  const lower = status.toLowerCase().replaceAll("_", " ")
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * Settings → Stores: one list of stores. A row opens that store's sheet
 * (customer phone, business page, what cashiers see); Add store opens a sheet.
 */
export function StoresDirectory({
  storeLimit,
}: {
  /** Stores the plan allows, from the server; null means no limit or unknown. */
  storeLimit: { limit: number; planName: string } | null
}) {
  const trpc = useTRPC()
  const stores = useQuery(trpc.tenant.stores.queryOptions())
  const { setCreateOpen, setDetailId } = useStoreParams()
  const count = stores.data?.length ?? 0
  return (
    <SettingsPage>
      <SettingsHeader
        title="Stores"
        actions={
          <Button onClick={() => void setCreateOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Add store
          </Button>
        }
      />
      {stores.isPending ? (
        <StoresSkeleton />
      ) : stores.isError ? (
        <div className="grid justify-items-start gap-3">
          <FormFeedback appearance="dashboard">
            Couldn't load your stores. {stores.error.message}
          </FormFeedback>
          <Button variant="outline" onClick={() => void stores.refetch()}>
            Try again
          </Button>
        </div>
      ) : count === 0 ? (
        <p className="rounded-[10px] border border-dashed p-6 text-muted-foreground">
          No stores yet.
        </p>
      ) : (
        <section className="grid gap-2.5" aria-label="Stores">
          <p className="text-muted-foreground">
            {storeLimit
              ? `${count} of ${storeLimit.limit} stores on ${storeLimit.planName}`
              : `${count} store${count === 1 ? "" : "s"}`}
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-[10px] border border-border bg-card">
            {stores.data.map((store) => (
              <li key={store.id}>
                <button
                  type="button"
                  data-store-row={store.id}
                  onClick={() => void setDetailId(store.id)}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--hover)]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <HugeiconsIcon icon={Store01Icon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 font-medium break-words">
                    {store.name}
                  </span>
                  {store.status === "ACTIVE" ? null : (
                    <SettingsStatusPill tone="muted">
                      {statusLabel(store.status)}
                    </SettingsStatusPill>
                  )}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <StoreSheets stores={stores.data ?? []} />
    </SettingsPage>
  )
}
