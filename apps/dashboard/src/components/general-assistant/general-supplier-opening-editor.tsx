"use client"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  Input,
  Textarea,
} from "@ewatrade/ui"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { Controller } from "react-hook-form"
import { useState } from "react"
import { z } from "zod"
type Action = Extract<GeneralAction, { action: "supplier_opening" }>
const schema = z.object({
  amount: z.string().refine((v) => {
    try {
      parseFinanceMoney(v)
      return true
    } catch {
      return false
    }
  }, "Enter a positive amount with up to two decimal places."),
  description: z
    .string()
    .trim()
    .min(1, "Describe this opening balance.")
    .max(400),
  acknowledged: z
    .boolean()
    .refine(
      (v) => v,
      "Confirm this pre-existing opening balance before saving.",
    ),
})
export function GeneralSupplierOpeningEditor({
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
  const amount = BigInt(initial.amountMinor),
    form = useZodForm<z.infer<typeof schema>>(schema, {
      defaultValues: {
        amount: `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`,
        description: initial.description,
        acknowledged: false,
      },
    })
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (disabled) return
        const parsed = generalActionSchema.safeParse({
          ...initial,
          amountMinor: parseFinanceMoney(values.amount),
          description: values.description,
          openingBalanceConfirmed: true,
        })
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the opening balance.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        Record a pre-existing supplier {initial.kind.toLowerCase()} at the
        reviewed Book start date. This changes opening balances and equity.
      </p>
      <FieldGroup>
        <ControlField
          label="Opening amount in the reviewed currency"
          error={form.formState.errors.amount?.message}
        >
          <Input
            {...form.register("amount")}
            inputMode="decimal"
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Description"
          error={form.formState.errors.description?.message}
        >
          <Textarea
            {...form.register("description")}
            maxLength={400}
            disabled={disabled}
          />
        </ControlField>
        <Controller
          control={form.control}
          name="acknowledged"
          render={({ field }) => (
            <CheckboxField
              label="This balance existed at the bookkeeping start date"
              error={form.formState.errors.acknowledged?.message}
            >
              <Checkbox
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                disabled={disabled}
              />
            </CheckboxField>
          )}
        />
      </FieldGroup>
      <p className="text-sm text-muted-foreground">
        The reviewed supplier, opening kind and Book start date stay selected.
        No money is sent, purchase recorded or stock moved. Ask for a new draft
        to change the source.
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
