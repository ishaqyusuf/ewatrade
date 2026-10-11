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
type Action = Extract<
  GeneralAction,
  {
    action:
      | "supplier_advance"
      | "supplier_advance_allocate"
      | "purchase_payment"
  }
>
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
  reference: z.string().trim().max(160),
  description: z
    .string()
    .trim()
    .min(1, "Describe this recorded operation.")
    .max(400),
  acknowledged: z
    .boolean()
    .refine((value) => value, "Confirm this recorded operation before saving."),
})
export function GeneralSupplierSettlementEditor({
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
      reference:
        initial.action === "purchase_payment" ? (initial.reference ?? "") : "",
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
          ...(initial.action === "purchase_payment"
            ? { reference: values.reference || undefined }
            : {}),
          effectiveAt:
            values.date === originalDate
              ? initial.effectiveAt
              : date.toISOString(),
          ...(initial.action === "supplier_advance_allocate"
            ? { allocationConfirmed: true }
            : { paymentAlreadyMade: true }),
        })
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the payment details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        {initial.action === "supplier_advance_allocate"
          ? "Apply existing supplier funds to the reviewed invoice. No cash moves."
          : initial.action === "supplier_advance"
            ? "Record funds already paid as an unallocated supplier advance. This does not pay an invoice or send money."
            : "Record money already paid against the reviewed purchase invoice. This does not send money or record another purchase."}
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
        {initial.action === "purchase_payment" ? (
          <ControlField
            label="Payment reference"
            error={form.formState.errors.reference?.message}
          >
            <Textarea
              {...form.register("reference")}
              maxLength={160}
              disabled={disabled}
            />
          </ControlField>
        ) : null}
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
              label={
                initial.action === "supplier_advance_allocate"
                  ? "Apply this existing advance to the reviewed invoice"
                  : "This payment was already made"
              }
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
        The reviewed supplier, invoice, advance and funding stay selected. Ask
        for a new draft to change the source.
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
