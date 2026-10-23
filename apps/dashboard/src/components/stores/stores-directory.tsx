"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  SettingsHeader,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { useSettingsAutosave } from "@/components/settings/use-settings-autosave"
import {
  ORDER_VISIBILITY_OPTIONS,
  type Visibility,
  useOrderVisibility,
  useUpdateOrderVisibility,
} from "@/components/staff/order-visibility-card"
import { StoresDataTable } from "@/components/tables/stores/data-table"
import { ViewDropdown, type ViewOption } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { useStoreParams } from "@/hooks/use-store-params"
import { useTRPC } from "@/trpc/client"
import type {
  DirectoryView,
  DirectoryViewSettings,
} from "@/utils/directory-view-settings"
import {
  Alert,
  AlertDescription,
  Button,
  SelectControl,
  Skeleton,
} from "@ewatrade/ui"
import {
  Add01Icon,
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useId } from "react"
import { CreateStoreModal } from "./create-store-modal"
import { StoreContactRow } from "./store-contact-row"

const storeViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

export function StoresSkeleton() {
  return (
    <div aria-label="Loading stores" className="grid gap-4 sm:grid-cols-2">
      {[0, 1].map((key) => (
        <Skeleton key={key} className="h-32 w-full" />
      ))}
    </div>
  )
}

/** What cashiers and sales reps can see, one row per store; saves on change. */
function OrderVisibilityRow({
  storeId,
  storeName,
}: {
  storeId: string
  storeName: string
}) {
  const id = useId()
  const query = useOrderVisibility(storeId)
  const update = useUpdateOrderVisibility(storeId)
  const autosave = useSettingsAutosave()
  const save = (visibility: Visibility, previous?: Visibility) =>
    update.mutate(
      { storeId, visibility },
      {
        onSuccess: () =>
          autosave.confirm(
            storeId,
            "Saved. Cashiers and sales reps see the change next time they open Orders.",
            previous
              ? () => update.mutate({ storeId, visibility: previous })
              : undefined,
          ),
      },
    )
  return (
    <SettingsRow
      label={storeName}
      htmlFor={id}
      saved={autosave.saved(storeId)}
      description={
        update.isError ? (
          <span role="alert" className="text-destructive">
            {update.error.message}
          </span>
        ) : query.isError ? (
          <span role="alert">Couldn't load this setting.</span>
        ) : null
      }
    >
      {query.isPending ? (
        <Skeleton className="h-9 w-56" />
      ) : query.isError ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      ) : (
        <SelectControl
          id={id}
          className="h-9 w-56"
          value={query.data.salesRepOrderVisibility}
          disabled={update.isPending}
          options={ORDER_VISIBILITY_OPTIONS}
          onValueChange={(visibility) =>
            save(visibility, query.data.salesRepOrderVisibility)
          }
        />
      )}
    </SettingsRow>
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
  const plan = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, { retry: false }),
  )
  const storeLimit = plan.data?.entitlements.find(
    (entitlement) => entitlement.key === "businesses",
  )
  const { setCreateOpen } = useStoreParams()
  return (
    <SettingsPage>
      <SettingsHeader
        title="Stores"
        description="Your shops or branches. Each store keeps its own stock, orders and staff."
        actions={
          <>
            <ViewDropdown
              label="Store view"
              value={view}
              options={storeViewOptions}
              onValueChange={setView}
            />
            <Button onClick={() => void setCreateOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
              Add store
            </Button>
          </>
        }
      />
      {persistenceError ? (
        <Alert appearance="dashboard" role="alert">
          <AlertDescription>{persistenceError}</AlertDescription>
          <Button variant="outline" size="sm" onClick={retryPersistence}>
            Try again
          </Button>
        </Alert>
      ) : null}
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
      ) : stores.data.length === 0 ? (
        <div className="rounded-[10px] border border-dashed p-6 text-sm text-muted-foreground">
          No stores yet. Add your first store to start selling.
        </div>
      ) : (
        <div className="grid gap-2.5">
          <p className="flex flex-wrap gap-x-2.5 text-sm">
            <span>
              {stores.data.length} store{stores.data.length === 1 ? "" : "s"}
            </span>
            {storeLimit?.limit ? (
              <span className="text-muted-foreground">
                {plan.data?.plan.name ?? "Your"} plan allows {storeLimit.limit}
              </span>
            ) : null}
          </p>
          <StoresDataTable stores={stores.data} view={view} />
        </div>
      )}
      {stores.data?.length ? (
        <SettingsSection
          title="Customer contact"
          description="Set the phone number customers use to reach each store."
        >
          {stores.data.map((store) => (
            <StoreContactRow
              key={store.id}
              storeId={store.id}
              storeName={store.name}
            />
          ))}
        </SettingsSection>
      ) : null}
      {stores.data?.length ? (
        <SettingsSection
          title="What cashiers and sales reps can see"
          description="Choose whether they see only the orders they made, or every order in their store."
        >
          {stores.data.map((store) => (
            <OrderVisibilityRow
              key={store.id}
              storeId={store.id}
              storeName={store.name}
            />
          ))}
        </SettingsSection>
      ) : null}
      <CreateStoreModal />
    </SettingsPage>
  )
}
