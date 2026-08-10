"use client"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  type ServiceCommerceStoreBindingConfiguration,
  serviceCommerceStoreBindingConfigurationSchema,
} from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
import { useEffect } from "react"
import type {
  CustomerChannelConnection,
  CustomerChannelStoreOption,
} from "./types"

export function StoreBindingForm({
  connection,
  isPending,
  onCancel,
  onSubmit,
  registerReset,
  stores,
}: {
  connection: CustomerChannelConnection
  isPending: boolean
  onCancel: () => void
  onSubmit: (values: ServiceCommerceStoreBindingConfiguration) => void
  registerReset?: RegisterServiceCommerceFormReset
  stores: CustomerChannelStoreOption[]
}) {
  const form = useZodForm<ServiceCommerceStoreBindingConfiguration>(
    serviceCommerceStoreBindingConfigurationSchema,
    {
      defaultValues: {
        connectionId: connection.id,
        storeIds: connection.storeAssignments.map((store) => store.id),
      },
    },
  )
  useEffect(() => {
    form.reset({
      connectionId: connection.id,
      storeIds: connection.storeAssignments.map((store) => store.id),
    })
  }, [connection, form])
  useEffect(
    () =>
      registerReset?.(() =>
        form.reset({
          connectionId: connection.id,
          storeIds: connection.storeAssignments.map((store) => store.id),
        }),
      ),
    [connection, form, registerReset],
  )
  const selected = form.watch("storeIds") ?? []

  return (
    <section className="grid gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          Store assignments
        </p>
        <h2 className="font-semibold">
          Route {connection.businessDisplayName || connection.displayNumber}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A central number may serve several locations, but customers must enter
          through a Store-specific link or choose a branch before sending
          content.
        </p>
      </div>
      <form className="grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
        <input type="hidden" {...form.register("connectionId")} />
        {stores.map((store) => (
          <label
            className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm"
            key={store.id}
          >
            <input
              checked={selected.includes(store.id)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...new Set([...selected, store.id])]
                  : selected.filter((id) => id !== store.id)
                form.setValue("storeIds", next, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }}
              type="checkbox"
            />
            <span className="font-medium">{store.name}</span>
          </label>
        ))}
        {form.formState.errors.storeIds?.message ? (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.storeIds.message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button disabled={isPending} type="submit">
            {isPending ? "Saving…" : "Save Store assignments"}
          </Button>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
        </div>
      </form>
    </section>
  )
}
