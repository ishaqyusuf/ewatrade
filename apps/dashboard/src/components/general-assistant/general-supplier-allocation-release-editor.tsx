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

const schema = z.object({
  amount: z.string().refine((value) => {
    try {
      parseFinanceMoney(value)
      return true
    } catch {
      return false
    }
  }, "Enter a positive amount with up to two decimal places."),
  date: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(1, "Explain why this allocation is being released.")
    .max(400),
  acknowledged: z
    .boolean()
    .refine((value) => value, "Confirm the allocation release before saving."),
})
export function GeneralSupplierAllocationReleaseEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: Extract<GeneralAction, { action: "supplier_allocation_release" }>
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const amount = BigInt(initial.amountMinor)
  const originalDate = new Date(initial.effectiveAt).toISOString().slice(0, 19)
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: {
      amount: `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`,
      date: originalDate,
      reason: initial.reason,
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
        const date = new Date(`${values.date}Z`)
        if (!Number.isFinite(date.getTime())) {
          form.setError("date", {
            message: "Choose a valid posting date and time.",
          })
          return
        }
        const parsed = generalActionSchema.safeParse({
          ...initial,
          amountMinor: parseFinanceMoney(values.amount),
          reason: values.reason,
          effectiveAt:
            values.date === originalDate
              ? initial.effectiveAt
              : date.toISOString(),
          releaseConfirmed: true,
        })
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the release details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        Restore part of the reviewed allocation to the original supplier
        advance. The invoice payable increases. No cash moves or refund is
        issued.
      </p>
      <FieldGroup>
        <ControlField
          label="Amount to release in the reviewed currency"
          error={form.formState.errors.amount?.message}
        >
          <Input
            {...form.register("amount")}
            inputMode="decimal"
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Release date and time (UTC)"
          error={form.formState.errors.date?.message}
        >
          <Input
            {...form.register("date")}
            type="datetime-local"
            step="1"
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Reason for release"
          error={form.formState.errors.reason?.message}
        >
          <Textarea
            {...form.register("reason")}
            maxLength={400}
            disabled={disabled}
          />
        </ControlField>
        <Controller
          control={form.control}
          name="acknowledged"
          render={({ field }) => (
            <CheckboxField
              label="Release this amount from the reviewed allocation"
              error={form.formState.errors.acknowledged?.message}
            >
              <Checkbox
                checked={field.value}
                onCheckedChange={(value) => field.onChange(value === true)}
                disabled={disabled}
              />
            </CheckboxField>
          )}
        />
      </FieldGroup>
      <p className="text-sm text-muted-foreground">
        The original allocation, advance and invoice stay selected. Ask for a
        new draft to change the source.
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
