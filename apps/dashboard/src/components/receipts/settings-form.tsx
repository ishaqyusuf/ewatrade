"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ReceiptSettings } from "@ewatrade/order-receipts"
import { Button, Checkbox, Textarea } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { ReceiptSettingsFormContext } from "./settings-form-context"
import { ReceiptSettingsPreview } from "./settings-preview"

type Settings = RouterOutputs["orders"]["receiptSettings"]

export function ReceiptSettingsForm({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const query = useQuery(trpc.orders.receiptSettings.queryOptions({ storeId }))
  const [scope, setScope] = useState<"business" | "store">("business")
  if (query.isError)
    return (
      <div className="grid gap-3">
        <FormFeedback>{query.error.message}</FormFeedback>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  if (!query.data)
    return <output aria-live="polite">Loading receipt settings…</output>
  return (
    <ReceiptSettingsFormContext
      key={`${storeId}:${scope}`}
      settings={
        scope === "business" ? query.data.business : query.data.effective
      }
    >
      <ReceiptSettingsEditor
        scope={scope}
        setScope={setScope}
        data={query.data}
      />
    </ReceiptSettingsFormContext>
  )
}

function ReceiptSettingsEditor({
  data,
  scope,
  setScope,
}: {
  data: Settings
  scope: "business" | "store"
  setScope: (value: "business" | "store") => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const form = useFormContext<ReceiptSettings>()
  const watched = useWatch<ReceiptSettings>({ control: form.control })
  const [inherit, setInherit] = useState(data.override === null)
  const [saved, setSaved] = useState(false)
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
        form.reset(scope === "business" ? next.business : next.effective)
        setSaved(true)
      },
    }),
  )
  const inherited = scope === "store" && inherit
  const settings: ReceiptSettings = inherited
    ? data.business
    : {
        showCustomerName: watched.showCustomerName ?? true,
        showPaymentBreakdown: watched.showPaymentBreakdown ?? true,
        thankYouNote: watched.thankYouNote ?? "",
      }
  return (
    <div className="grid gap-6">
      <fieldset
        className="flex flex-wrap gap-2"
        aria-label="Receipt settings scope"
      >
        <Button
          variant={scope === "business" ? "default" : "outline"}
          disabled={mutation.isPending}
          aria-pressed={scope === "business"}
          onClick={() => setScope("business")}
        >
          Business defaults
        </Button>
        <Button
          variant={scope === "store" ? "default" : "outline"}
          disabled={mutation.isPending}
          aria-pressed={scope === "store"}
          onClick={() => setScope("store")}
        >
          {data.storeName}
        </Button>
      </fieldset>
      <p className="text-sm text-muted-foreground">
        {scope === "business"
          ? "Used across your business unless a Store saves its own settings."
          : `Settings for ${data.storeName}. Other Stores keep their own defaults.`}
      </p>
      <div className="grid items-start gap-6 md:grid-cols-[1fr_1fr]">
        <form
          className="grid gap-6"
          onChange={() => setSaved(false)}
          onSubmit={form.handleSubmit((values) => {
            setSaved(false)
            mutation.mutate({
              storeId: data.storeId,
              scope,
              settings: inherited ? null : values,
            })
          })}
        >
          {scope === "store" ? (
            <label
              htmlFor="receipt-inherit"
              className="flex items-start gap-3 border-b border-border pb-5"
            >
              <Checkbox
                id="receipt-inherit"
                aria-label="Use business defaults"
                checked={inherit}
                disabled={mutation.isPending}
                onCheckedChange={(value) => {
                  setInherit(value)
                  setSaved(false)
                }}
              />
              <span className="text-sm">Use business defaults</span>
            </label>
          ) : null}
          <fieldset
            disabled={inherited || mutation.isPending}
            className="grid gap-6 disabled:opacity-50"
          >
            <label
              htmlFor="receipt-customer"
              className="flex items-start gap-3"
            >
              <Checkbox
                id="receipt-customer"
                disabled={inherited || mutation.isPending}
                aria-label="Show customer name"
                checked={settings.showCustomerName}
                onCheckedChange={(value) => {
                  form.setValue("showCustomerName", value, {
                    shouldDirty: true,
                  })
                  setSaved(false)
                }}
              />
              <span>
                <span className="block text-sm">Customer name</span>
                <span className="block pt-1 text-xs text-muted-foreground">
                  Show the name recorded on the Order.
                </span>
              </span>
            </label>
            <label
              htmlFor="receipt-payments"
              className="flex items-start gap-3"
            >
              <Checkbox
                id="receipt-payments"
                disabled={inherited || mutation.isPending}
                aria-label="Show payment breakdown"
                checked={settings.showPaymentBreakdown}
                onCheckedChange={(value) => {
                  form.setValue("showPaymentBreakdown", value, {
                    shouldDirty: true,
                  })
                  setSaved(false)
                }}
              />
              <span>
                <span className="block text-sm">Payment breakdown</span>
                <span className="block pt-1 text-xs text-muted-foreground">
                  Show received amount, balance, payments and refunds. Payment
                  status always appears.
                </span>
              </span>
            </label>
            <div className="grid gap-2">
              <label htmlFor="receipt-thank-you" className="text-sm">
                Thank-you note
              </label>
              <Textarea
                id="receipt-thank-you"
                rows={4}
                maxLength={300}
                {...form.register("thankYouNote")}
                value={settings.thankYouNote}
                aria-invalid={Boolean(form.formState.errors.thankYouNote)}
              />
              <p className="text-xs text-muted-foreground">
                Optional · {settings.thankYouNote.length}/300 characters
              </p>
              {form.formState.errors.thankYouNote ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.thankYouNote.message}
                </p>
              ) : null}
            </div>
          </fieldset>
          {mutation.error ? (
            <FormFeedback appearance="dashboard">
              {mutation.error.message}
            </FormFeedback>
          ) : null}
          {saved ? (
            <FormFeedback appearance="dashboard" variant="default">
              Receipt settings saved.
            </FormFeedback>
          ) : null}
          <Button
            type="submit"
            disabled={mutation.isPending || !form.formState.isValid}
          >
            {mutation.isPending
              ? "Saving…"
              : inherited
                ? "Save business inheritance"
                : "Save receipt settings"}
          </Button>
        </form>
        <ReceiptSettingsPreview
          settings={settings}
          businessName={data.businessName}
          storeName={data.storeName}
          currencyCode={data.currencyCode}
        />
      </div>
    </div>
  )
}
