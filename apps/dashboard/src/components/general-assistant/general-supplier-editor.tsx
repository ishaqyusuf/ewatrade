"use client"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { Button, ControlField, FieldGroup, Input } from "@ewatrade/ui"
import { useState } from "react"
import { z } from "zod"

type Action = Extract<GeneralAction, { action: "supplier_create" }>
const schema = z.object({
  name: z.string().trim().min(1, "Enter a supplier name.").max(160),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9_-]{0,39}$/,
      "Use 1–40 letters, numbers, hyphens or underscores; start with a letter or number.",
    ),
})
export function GeneralSupplierEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: Action
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: { name: initial.name, code: initial.code },
  })
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (disabled) return
        const parsed = generalActionSchema.safeParse({ ...initial, ...values })
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the supplier details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      })}
    >
      <FieldGroup>
        <ControlField
          label="Supplier name"
          error={form.formState.errors.name?.message}
        >
          <Input
            {...form.register("name")}
            maxLength={160}
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Supplier code"
          error={form.formState.errors.code?.message}
        >
          <Input
            {...form.register("code")}
            maxLength={40}
            disabled={disabled}
          />
        </ControlField>
      </FieldGroup>
      <p className="text-sm text-muted-foreground">
        Creates a supplier with no opening balance. Purchases and payments are
        separate. The reviewed Finance Book stays selected.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={disabled}>
          Save and review
        </Button>
      </div>
    </form>
  )
}
