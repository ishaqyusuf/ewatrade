"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import { Button, Field, FieldError, FieldLabel, Input } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { z } from "zod"

const schema = z.object({
  name: z.string().trim().min(1, "Enter a Store name.").max(120),
})

export function CreateStoreForm({
  onCreated,
  onSubmittingChange,
}: {
  onCreated: () => Promise<unknown>
  onSubmittingChange: (pending: boolean) => void
}) {
  const trpc = useTRPC()
  const cache = useQueryClient()
  const router = useRouter()
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: { name: "" },
  })
  const create = useMutation(trpc.tenant.createStore.mutationOptions())

  useEffect(() => {
    onSubmittingChange(form.formState.isSubmitting)
  }, [form.formState.isSubmitting, onSubmittingChange])

  useEffect(() => () => onSubmittingChange(false), [onSubmittingChange])

  return (
    <form
      className="grid gap-6"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await create.mutateAsync(values)
        } catch {
          return
        }
        await Promise.all([
          cache.invalidateQueries({ queryKey: trpc.tenant.stores.queryKey() }),
          cache.invalidateQueries({ queryKey: trpc.tenant.current.queryKey() }),
        ])
        router.refresh()
        await onCreated()
      })}
    >
      <Field data-invalid={Boolean(form.formState.errors.name)}>
        <FieldLabel htmlFor="new-store-name">Store name</FieldLabel>
        <Input
          id="new-store-name"
          autoFocus
          maxLength={120}
          disabled={form.formState.isSubmitting}
          aria-invalid={Boolean(form.formState.errors.name)}
          {...form.register("name")}
        />
        {form.formState.errors.name ? (
          <FieldError>{form.formState.errors.name.message}</FieldError>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Uses your business currency. Staff access is managed separately.
        </p>
      </Field>
      {create.error ? (
        <FormFeedback appearance="dashboard">
          {create.error.message}
          {create.error.data?.appError?.code === "STORE_LIMIT_REACHED" ? (
            <>
              {" "}
              <Link
                href="/settings/billing"
                className="underline underline-offset-4"
              >
                View plans
              </Link>
            </>
          ) : null}
        </FormFeedback>
      ) : null}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Adding Store…" : "Add Store"}
      </Button>
    </form>
  )
}
