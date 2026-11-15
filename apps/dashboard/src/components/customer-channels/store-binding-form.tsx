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
    <section className="grid gap-4 rounded-[10px] border border-border bg-card p-4">
      <h2 className="font-semibold">Stores that use this number</h2>
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
              {isPending ? "Saving…" : "Save"}
            </SubmitButton>
            <Button onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
          </FormActions>
        </FieldGroup>
      </form>
    </section>
  )
}
