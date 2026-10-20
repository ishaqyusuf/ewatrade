"use client"
import {
  SettingsHeader,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import {
  ALL_STORES,
  SettingsStorePicker,
} from "@/components/settings/settings-store-picker"
import { useSettingsAutosave } from "@/components/settings/use-settings-autosave"
import { useSettingsStoreParams } from "@/hooks/use-settings-store-params"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ReceiptSettings } from "@ewatrade/order-receipts"
import { Button, Switch, Textarea } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { ReceiptSettingsPreview } from "./settings-preview"

type Settings = RouterOutputs["orders"]["receiptSettings"]
type Store = { id: string; name: string }

const NOTE_LIMIT = 300

/**
 * What prints on every receipt, for all stores or one store. Switches save as
 * they change; the thank-you note has its own Save.
 */
export function ReceiptSettingsForm({
  activeStoreId,
  stores,
}: {
  activeStoreId: string
  stores: Store[]
}) {
  const trpc = useTRPC()
  const { storeId: param, setStoreId } = useSettingsStoreParams()
  const store = stores.find((option) => option.id === param) ?? null
  // Business-wide settings are read through the active store.
  const queryStoreId = store?.id ?? activeStoreId
  const query = useQuery(
    trpc.orders.receiptSettings.queryOptions({ storeId: queryStoreId }),
  )
  return (
    <SettingsPage>
      <SettingsHeader
        title="Receipts"
        description="Choose what prints on every receipt. Orders use these automatically."
        actions={
          <SettingsStorePicker
            includeAll
            stores={stores}
            value={store?.id ?? ALL_STORES}
            onChange={(next) =>
              void setStoreId(next === ALL_STORES ? null : next)
            }
          />
        }
      />
      {query.isError ? (
        <div role="alert" className="grid justify-items-start gap-2 text-sm">
          <p>Couldn't load your receipt settings. {query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : !query.data ? (
        <output aria-live="polite" className="text-sm text-muted-foreground">
          Loading receipt settings…
        </output>
      ) : (
        <ReceiptSettingsEditor
          key={`${queryStoreId}:${store ? "store" : "business"}`}
          data={query.data}
          scope={store ? "store" : "business"}
        />
      )}
    </SettingsPage>
  )
}

function ReceiptSettingsEditor({
  data,
  scope,
}: {
  data: Settings
  scope: "business" | "store"
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const autosave = useSettingsAutosave()
  const inherited = scope === "store" && data.override === null
  const current: ReceiptSettings =
    scope === "business" ? data.business : (data.override ?? data.business)
  const [note, setNote] = useState(current.thankYouNote)
  const mutation = useMutation(
    trpc.orders.saveReceiptSettings.mutationOptions({
      onSuccess: (next) => {
        queryClient.setQueryData(
          trpc.orders.receiptSettings.queryKey({ storeId: data.storeId }),
          next,
        )
        void queryClient.invalidateQueries({
          queryKey: trpc.orders.receiptSettings.queryKey(),
        })
        void queryClient.invalidateQueries({
          queryKey: trpc.orders.prepareReceipts.queryKey(),
        })
      },
    }),
  )
  const save = (
    key: string,
    settings: ReceiptSettings | null,
    message: string,
    undo?: ReceiptSettings | null,
  ) =>
    mutation.mutate(
      { storeId: data.storeId, scope, settings },
      {
        onSuccess: () =>
          autosave.confirm(
            key,
            message,
            undo === undefined
              ? undefined
              : () =>
                  mutation.mutate({
                    storeId: data.storeId,
                    scope,
                    settings: undo,
                  }),
          ),
      },
    )
  const toggle = (field: "showCustomerName" | "showPaymentBreakdown") =>
    save(
      field,
      { ...current, [field]: !current[field] },
      "Receipt saved.",
      scope === "store" ? data.override : data.business,
    )
  const noteChanged = note !== current.thankYouNote
  const preview: ReceiptSettings = { ...current, thankYouNote: note }
  const storeName = data.storeName

  return (
    <div className="grid gap-7">
      <SettingsSection
        title={
          scope === "store"
            ? `Receipt at ${storeName}`
            : "What's on the receipt"
        }
        description={
          inherited
            ? `${storeName} uses the business receipt. Change it under All stores.`
            : scope === "store"
              ? `Only for ${storeName}. Other stores aren't changed.`
              : "Used by every store unless a store has its own."
        }
      >
        {scope === "store" ? (
          <SettingsRow
            label="Use the business receipt"
            htmlFor="receipt-inherit"
            description={`Turn off to give ${storeName} its own receipt.`}
            saved={autosave.saved("inherit")}
          >
            <Switch
              id="receipt-inherit"
              checked={inherited}
              disabled={mutation.isPending}
              onCheckedChange={(value) =>
                save(
                  "inherit",
                  value ? null : data.business,
                  value
                    ? `${storeName} uses the business receipt again.`
                    : `${storeName} now has its own receipt.`,
                  data.override,
                )
              }
            />
          </SettingsRow>
        ) : null}
        <SettingsRow
          label="Show customer name"
          htmlFor="receipt-customer"
          description="Print the customer's name at the top."
          disabled={inherited}
          saved={autosave.saved("showCustomerName")}
        >
          <Switch
            id="receipt-customer"
            checked={current.showCustomerName}
            disabled={inherited || mutation.isPending}
            onCheckedChange={() => toggle("showCustomerName")}
          />
        </SettingsRow>
        <SettingsRow
          label="Show payment details"
          htmlFor="receipt-payments"
          description="Show the payment received, balance due and each payment. Paid or unpaid always shows."
          disabled={inherited}
          saved={autosave.saved("showPaymentBreakdown")}
        >
          <Switch
            id="receipt-payments"
            checked={current.showPaymentBreakdown}
            disabled={inherited || mutation.isPending}
            onCheckedChange={() => toggle("showPaymentBreakdown")}
          />
        </SettingsRow>
        <div className="grid gap-1.5 px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="receipt-thank-you" className="text-sm font-medium">
              Thank-you note
            </label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {note.length} / {NOTE_LIMIT}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Printed at the bottom of every receipt.
          </p>
          <Textarea
            id="receipt-thank-you"
            rows={3}
            maxLength={NOTE_LIMIT}
            placeholder="Thank you for shopping with us."
            disabled={inherited || mutation.isPending}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {noteChanged && !inherited ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={mutation.isPending}
                onClick={() => setNote(current.thankYouNote)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={mutation.isPending}
                onClick={() =>
                  save(
                    "thankYouNote",
                    { ...current, thankYouNote: note },
                    "Thank-you note saved.",
                  )
                }
              >
                {mutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : null}
        </div>
        {mutation.isError ? (
          <p role="alert" className="px-4 py-3 text-sm text-destructive">
            Couldn't save. {mutation.error.message}
          </p>
        ) : null}
      </SettingsSection>
      <SettingsSection title="Preview" bare>
        <ReceiptSettingsPreview
          settings={preview}
          businessName={data.businessName}
          storeName={storeName}
          currencyCode={data.currencyCode}
        />
      </SettingsSection>
    </div>
  )
}
