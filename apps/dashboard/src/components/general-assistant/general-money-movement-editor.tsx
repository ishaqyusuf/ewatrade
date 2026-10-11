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
type Action = Extract<GeneralAction, { action: "money_movement" }>
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
  description: z.string().trim().min(1, "Describe the movement.").max(400),
  acknowledged: z
    .boolean()
    .refine((value) => value, "Confirm that the movement already happened."),
})
export function GeneralMoneyMovementEditor({
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
    originalDate = new Date(initial.effectiveAt).toISOString().slice(0, 19)
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: {
      amount: `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`,
      date: originalDate,
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
          description: values.description,
          effectiveAt:
            values.date === originalDate
              ? initial.effectiveAt
              : date.toISOString(),
          movementAlreadyCompleted: true,
        })
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the movement details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        Record a completed {initial.kind.toLowerCase().replaceAll("_", " ")}.
        This does not send money or verify bank settlement.
      </p>
      <FieldGroup>
        <ControlField
          label="Amount in the reviewed currency"
          error={form.formState.errors.amount?.message}
        >
          <Input
            {...form.register("amount")}
            inputMode="decimal"
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Posting date and time (UTC)"
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
              label="This money movement has already happened"
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
        The reviewed movement type and accounts stay selected. Ask for a new
        draft to change them.
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
