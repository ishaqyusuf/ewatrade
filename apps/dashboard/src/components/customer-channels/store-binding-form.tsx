"use client"
import {
  Button,
  Checkbox,
  CheckboxField,
  FieldGroup,
  FormActions,
  SubmitButton,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  type ServiceCommerceStoreBindingConfiguration,
  serviceCommerceStoreBindingConfigurationSchema,
} from "@ewatrade/service-commerce"

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
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup className="min-w-0 grid gap-3">
          <input type="hidden" {...form.register("connectionId")} />
          {stores.map((store) => (
            <CheckboxField
              key={store.id}
              label=<span className="font-medium">{store.name}</span>
            >
              <Checkbox
                checked={selected.includes(store.id)}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? [...new Set([...selected, store.id])]
                    : selected.filter((id) => id !== store.id)
                  form.setValue("storeIds", next, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }}
              />
            </CheckboxField>
          ))}
          {form.formState.errors.storeIds?.message ? (
            <FormFeedback appearance="dashboard">
              {form.formState.errors.storeIds.message}
            </FormFeedback>
          ) : null}
          <FormActions className="pt-2">
            <SubmitButton
              isSubmitting={isPending}
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Saving…" : "Save Store assignments"}
            </SubmitButton>
            <Button
              appearance="form"
              onClick={onCancel}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </FormActions>
        </FieldGroup>
      </form>
    </section>
  )
}
