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
} from "@ewatrade/ui"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { Controller } from "react-hook-form"
import { useState } from "react"
import { z } from "zod"

type Action = Extract<GeneralAction, { action: "purchase_recognize" }>
const validDate = (value: string) =>
  Number.isFinite(new Date(`${value}Z`).getTime())
function schemaFor(invoice: boolean) {
  return z.object({
    date: z.string().refine(validDate, "Choose a valid fact date and time."),
    reference: z.string().trim().min(1, "Enter the source reference.").max(160),
    amount: z.string().refine((value) => {
      if (!invoice) return true
      try {
        parseFinanceMoney(value)
        return true
      } catch {
        return false
      }
    }, "Enter a positive invoice amount with up to two decimal places."),
    dueDate: z
      .string()
      .refine(
        (value) => !value || validDate(value),
        "Choose a valid due date and time.",
      ),
    acknowledged: z
      .boolean()
      .refine(Boolean, "Confirm this purchase fact before saving."),
  })
}
function editedDate(value: string, original?: string) {
  const iso = new Date(`${value}Z`).toISOString()
  return original &&
    iso.slice(0, 19) === new Date(original).toISOString().slice(0, 19)
    ? original
    : iso
}
function major(value?: string) {
  if (!value) return ""
  const amount = BigInt(value)
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`
}

export function GeneralPurchaseRecognitionEditor({
  initial,
  currencyCode,
  disabled,
  onSave,
  onCancel,
}: {
  initial: Action
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const invoice = initial.stage === "INVOICE"
  const schema = schemaFor(invoice)
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: {
      date: new Date(initial.effectiveAt).toISOString().slice(0, 19),
      reference: initial.reference,
      amount: major(initial.invoiceAmountMinor),
      dueDate: initial.dueAt
        ? new Date(initial.dueAt).toISOString().slice(0, 19)
        : "",
      acknowledged: false,
    },
  })
  const [error, setError] = useState<string | null>(null)
  const errors = form.formState.errors
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (disabled) return
        const effectiveAt = editedDate(values.date, initial.effectiveAt)
        const dueAt =
          invoice && values.dueDate
            ? editedDate(values.dueDate, initial.dueAt)
            : undefined
        if (dueAt && new Date(dueAt) < new Date(effectiveAt)) {
          form.setError("dueDate", {
            message: "The invoice due date cannot precede its fact date.",
          })
          return
        }
        const { invoiceAmountMinor: _amount, dueAt: _due, ...fixed } = initial
        const result = generalActionSchema.safeParse({
          ...fixed,
          effectiveAt,
          reference: values.reference,
          factConfirmed: true,
          ...(invoice
            ? {
                invoiceAmountMinor: parseFinanceMoney(values.amount),
                ...(dueAt ? { dueAt } : {}),
              }
            : {}),
        })
        if (!result.success) {
          setError(
            result.error.issues[0]?.message ?? "Check the purchase fact.",
          )
          return
        }
        setError(null)
        onSave(result.data)
      })}
    >
      <section className="grid gap-2 rounded-lg border bg-muted/30 p-4">
        <h3 className="text-sm font-medium">
          {invoice ? "Supplier invoice" : "Ownership of agreed goods"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {invoice
            ? "Records one invoice and supplier payable using the original agreed costs. It does not declare ownership, record stock receipt or send money."
            : "Records ownership using the original agreed costs. No new supplier payable, stock receipt or money transfer."}
        </p>
      </section>
      <p className="text-sm text-muted-foreground">
        The reviewed Book, agreement and fact type stay selected. Ask for a new
        draft to change them.
      </p>
      <FieldGroup>
        <ControlField
          label={`${invoice ? "Invoice" : "Ownership"} date and time (UTC)`}
          error={errors.date?.message}
        >
          <Input
            {...form.register("date")}
            type="datetime-local"
            step="1"
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Source reference"
          error={errors.reference?.message}
        >
          <Input
            {...form.register("reference")}
            maxLength={160}
            disabled={disabled}
          />
        </ControlField>
        {invoice ? (
          <>
            <ControlField
              label={`Invoice amount (${currencyCode})`}
              error={errors.amount?.message}
              description="The invoice must match the original total agreed cost. Review will check the exact amount."
            >
              <Input
                {...form.register("amount")}
                inputMode="decimal"
                disabled={disabled}
              />
            </ControlField>
            <ControlField
              label="Due date and time (UTC, optional)"
              error={errors.dueDate?.message}
            >
              <Input
                {...form.register("dueDate")}
                type="datetime-local"
                step="1"
                disabled={disabled}
              />
            </ControlField>
          </>
        ) : null}
      </FieldGroup>
      <Controller
        control={form.control}
        name="acknowledged"
        render={({ field }) => (
          <CheckboxField
            label={
              invoice
                ? "This invoice is confirmed; no payment or stock receipt"
                : "Ownership is confirmed; no payment or stock receipt"
            }
            error={errors.acknowledged?.message}
          >
            <Checkbox
              checked={field.value}
              onCheckedChange={(value) => field.onChange(value === true)}
              disabled={disabled}
            />
          </CheckboxField>
        )}
      />
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
