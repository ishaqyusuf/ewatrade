"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { useSettingsAutosave } from "@/components/settings/use-settings-autosave"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import {
  ORDER_VISIBILITY_OPTIONS,
  type Visibility,
  useOrderVisibility,
  useUpdateOrderVisibility,
} from "@/components/staff/order-visibility-card"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useStoreParams } from "@/hooks/use-store-params"
import { Button, SelectControl, Sheet, Skeleton } from "@ewatrade/ui"
import { useId, useState } from "react"
import { CreateStoreForm } from "./create-store-form"
import { StoreContactRow } from "./store-contact-row"
import { StorePublicListingRow } from "./store-public-listing-row"

type StoreOption = { id: string; name: string }

/** Who cashiers and sales reps see orders for at this store; saves on change. */
function OrderVisibilityRow({ storeId }: { storeId: string }) {
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
            "visibility",
            "Saved.",
            previous
              ? () => update.mutate({ storeId, visibility: previous })
              : undefined,
          ),
      },
    )
  return (
    <SettingsRow
      label="Orders they see"
      htmlFor={id}
      saved={autosave.saved("visibility")}
      description={
        update.isError ? (
          <span role="alert" className="text-destructive">
            {update.error.message}
          </span>
        ) : null
      }
    >
      {query.isPending ? (
        <Skeleton className="h-11 w-56" />
      ) : query.isError ? (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      ) : (
        <SelectControl
          id={id}
          className="w-full min-w-56 sm:w-56"
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

/**
 * Stores page sheets: `?storeSheet=create` adds a store, `?storeDetail=<id>`
 * holds that store's own settings. Each store's settings are read only when
 * its sheet opens.
 */
export function StoreSheets({ stores }: { stores: StoreOption[] }) {
  const { createOpen, detailId, setCreateOpen, setDetailId } = useStoreParams()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const create = useSheetDismissal(() => setCreateOpen(false))
  const store = stores.find((option) => option.id === detailId) ?? null
  return (
    <>
      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) void create.requestClose()
        }}
      >
        {createOpen ? (
          <SheetFrame title="Add store" closeDisabled={isSubmitting}>
            {create.closeError ? (
              <FormFeedback appearance="dashboard">
                {create.closeError}
              </FormFeedback>
            ) : null}
            <CreateStoreForm
              onCreated={create.requestClose}
              onSubmittingChange={setIsSubmitting}
            />
          </SheetFrame>
        ) : null}
      </Sheet>
      <Sheet
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) void setDetailId(null)
        }}
      >
        {detailId ? (
          <SheetFrame title={store?.name ?? "Store"}>
            {store ? (
              <div className="grid gap-7">
                <SettingsSection title="Customers">
                  <StoreContactRow storeId={store.id} />
                  <StorePublicListingRow storeId={store.id} />
                </SettingsSection>
                <SettingsSection title="Cashiers and sales reps">
                  <OrderVisibilityRow storeId={store.id} />
                </SettingsSection>
              </div>
            ) : (
              <FormFeedback appearance="dashboard">
                This store isn't available.
              </FormFeedback>
            )}
          </SheetFrame>
        ) : null}
      </Sheet>
    </>
  )
}
