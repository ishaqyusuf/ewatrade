"use client"

import {
  Alert,
  AlertDescription,
  Button,
  FieldGroup,
  FormActions,
  Input,
} from "@ewatrade/ui"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"

import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const schema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/, "Use 1–40 letters, numbers, _ or -."),
  name: z.string().trim().min(1, "Enter a supplier name.").max(160),
})

type Values = z.infer<typeof schema>

export function FinanceSupplierForm({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const mutation = useMutation(trpc.finance.createSupplier.mutationOptions())
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    "createSupplier",
  )
  const [review, setReview] = useState<Values | null>(null)
  const form = useZodForm<Values>(schema, {
    defaultValues: { code: "", name: "" },
  })

  function submit(values: Values) {
    const payload = {
      bookId: book.id,
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
    }
    void command.run({
      payload,
      write: (clientCommandId) =>
        mutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }

  if (review) {
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
      >
        <h4 className="font-medium">New supplier</h4>
        <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-muted-foreground">Code</dt>
          <dd className="font-medium">{review.code}</dd>
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-medium">{review.name}</dd>
        </dl>
        <Alert appearance="dashboard">
          <AlertDescription>
            This adds a supplier identity to this finance book. It does not
            record a payable, advance, purchase, or cash movement.
          </AlertDescription>
        </Alert>
      </FinanceReview>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(setReview)}>
      <FieldGroup className="min-w-0 grid gap-5">
        <FinanceField
          label="Supplier code"
          error={form.formState.errors.code?.message}
        >
          <Input
            autoComplete="off"
            maxLength={40}
            placeholder="e.g. ACME-001"
            disabled={!command.ready}
            {...form.register("code")}
          />
        </FinanceField>
        <FinanceField
          label="Supplier name"
          error={form.formState.errors.name?.message}
        >
          <Input
            autoComplete="organization"
            maxLength={160}
            placeholder="Business or supplier name"
            disabled={!command.ready}
            {...form.register("name")}
          />
        </FinanceField>
        {mutation.error ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <FormActions>
          <Button appearance="form" type="submit" disabled={!command.ready}>
            Review supplier
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
