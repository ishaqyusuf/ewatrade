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
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { Controller } from "react-hook-form"
import { useState } from "react"
import { z } from "zod"

type RefundAction = Extract<GeneralAction, { action: "held_credit_refund" }>
const fieldsSchema = z.object({
  amount: z.string().refine((value) => {
    try {
      parseFinanceMoney(value)
      return true
    } catch {
      return false
    }
  }, "Enter a positive amount with up to two decimal places."),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"]),
  date: z.string().min(1, "Choose the payout date and time."),
  reason: z.string().trim().min(1, "Enter a reason.").max(400),
  reference: z.string().trim().max(160),
  acknowledged: z
    .boolean()
    .refine(
      (value) => value,
      "Confirm that the money has already been returned.",
    ),
})

export function GeneralHeldCreditRefundEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: RefundAction
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const amount = BigInt(initial.amountMinor)
  const originalDate = new Date(initial.effectiveAt).toISOString().slice(0, 19)
  const form = useZodForm<z.infer<typeof fieldsSchema>>(fieldsSchema, {
    defaultValues: {
      amount: `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`,
      method: initial.method,
      date: originalDate,
      reason: initial.reason,
      reference: initial.reference ?? "",
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
            message: "Choose a valid payout date and time.",
          })
          return
        }
        const parsed = generalActionSchema.safeParse({
          ...initial,
          amountMinor: parseFinanceMoney(values.amount),
          method: values.method,
          effectiveAt:
            values.date === originalDate
              ? initial.effectiveAt
              : date.toISOString(),
          reason: values.reason,
          reference: values.reference || undefined,
          moneyAlreadyReturned: true,
        })
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the refund details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        Record unused customer funds you have already returned. This does not
        send money or request a provider refund. Review the updated balance
        before confirming.
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
        <Controller
          control={form.control}
          name="method"
          render={({ field }) => (
            <ControlField
              label="How was the money returned?"
              error={form.formState.errors.method?.message}
            >
              <SelectControl
                value={field.value}
                onValueChange={field.onChange}
                disabled={disabled}
                options={[
                  { value: "CASH", label: "Cash" },
                  { value: "BANK_TRANSFER", label: "Bank transfer" },
                  { value: "CARD", label: "Card" },
                  { value: "POS", label: "POS" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
            </ControlField>
          )}
        />
        <p className="text-sm text-muted-foreground">
          The reviewed customer, credit source and payout account stay selected.
          To change them, ask the assistant for a new draft. The payout account
          must match the method.
        </p>
        <ControlField
          label="Payout date and time (UTC)"
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
          label="Reason for returning funds"
          error={form.formState.errors.reason?.message}
        >
          <Textarea
            {...form.register("reason")}
            maxLength={400}
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Reference (optional)"
          error={form.formState.errors.reference?.message}
        >
          <Input
            {...form.register("reference")}
            maxLength={160}
            disabled={disabled}
          />
        </ControlField>
        <Controller
          control={form.control}
          name="acknowledged"
          render={({ field }) => (
            <CheckboxField
              label="I have already returned this money to the customer"
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
