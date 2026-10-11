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

type ReceiptAction = Extract<GeneralAction, { action: "customer_receipt" }>
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
  description: z
    .string()
    .trim()
    .min(1, "Describe the new money received.")
    .max(400),
  reference: z.string().trim().max(160),
  acknowledged: z
    .boolean()
    .refine(
      (value) => value,
      "Confirm that the money has already been received.",
    ),
})

export function GeneralCustomerReceiptEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: ReceiptAction
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const amount = BigInt(initial.amountMinor)
  const form = useZodForm<z.infer<typeof fieldsSchema>>(fieldsSchema, {
    defaultValues: {
      amount: `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`,
      method: initial.method,
      description: initial.description,
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
        const parsed = generalActionSchema.safeParse({
          ...initial,
          amountMinor: parseFinanceMoney(values.amount),
          method: values.method,
          description: values.description,
          reference: values.reference || undefined,
          moneyAlreadyReceived: true,
        })
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the receipt details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        Record new customer money you have already received. This adds
        unallocated credit; it does not collect money or settle an order. Do not
        record an existing order payment again as a deposit.
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
              label="How was the money received?"
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
          The reviewed customer and receiving account stay selected. To change
          them, ask the assistant for a new draft. The account must match the
          method. The receipt is dated when you confirm it.
        </p>
        <ControlField
          label="Description of received funds"
          error={form.formState.errors.description?.message}
        >
          <Textarea
            {...form.register("description")}
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
              label="I have already received this new money from the customer"
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
