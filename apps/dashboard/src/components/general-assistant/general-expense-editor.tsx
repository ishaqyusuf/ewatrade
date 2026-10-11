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
type Action = Extract<GeneralAction, { action: "expense_record" }>
const moneyInput = z.string().refine((value) => {
  try {
    parseFinanceMoney(value)
    return true
  } catch {
    return false
  }
}, "Enter a positive amount with up to two decimal places.")
const dateInput = z
  .string()
  .refine(
    (value) => Number.isFinite(new Date(`${value}Z`).getTime()),
    "Choose a valid date and time.",
  )
const schema = z.object({
  payee: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(400),
  reference: z.string().trim().max(160),
  incurred: dateInput,
  due: z.union([z.literal(""), dateInput]),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        amount: moneyInput,
      }),
    )
    .min(1),
  payment: z
    .object({
      amount: moneyInput,
      date: dateInput,
      reference: z.string().trim().max(160),
      acknowledged: z
        .boolean()
        .refine(Boolean, "Confirm that this payment was already made."),
    })
    .optional(),
  acknowledged: z
    .boolean()
    .refine(Boolean, "Confirm that this expense was already incurred."),
})
function major(value: string) {
  const n = BigInt(value)
  return `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`
}
function dateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 19)
}
function timestamp(value: string, original?: string) {
  return original && value === dateInputValue(original)
    ? original
    : new Date(`${value}Z`).toISOString()
}
export function GeneralExpenseEditor({
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
  const [error, setError] = useState<string | null>(null)
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: {
      payee: initial.payeeName,
      description: initial.description,
      reference: initial.reference ?? "",
      incurred: dateInputValue(initial.incurredAt),
      due: initial.dueAt ? dateInputValue(initial.dueAt) : "",
      acknowledged: false,
      lines: initial.lines.map((line) => ({
        description: line.description,
        amount: major(line.amountMinor),
      })),
      payment: initial.payment
        ? {
            amount: major(initial.payment.amountMinor),
            date: dateInputValue(initial.payment.effectiveAt),
            reference: initial.payment.reference ?? "",
            acknowledged: false,
          }
        : undefined,
    },
  })
  const errors = form.formState.errors
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (disabled) return
        const result = generalActionSchema.safeParse({
          ...initial,
          payeeName: values.payee,
          description: values.description,
          reference: values.reference || undefined,
          incurredAt: timestamp(values.incurred, initial.incurredAt),
          dueAt: values.due ? timestamp(values.due, initial.dueAt) : undefined,
          lines: initial.lines.map((line, index) => ({
            ...line,
            description: values.lines[index]!.description,
            amountMinor: parseFinanceMoney(values.lines[index]!.amount),
          })),
          payment:
            initial.payment && values.payment
              ? {
                  ...initial.payment,
                  amountMinor: parseFinanceMoney(values.payment.amount),
                  effectiveAt: timestamp(
                    values.payment.date,
                    initial.payment.effectiveAt,
                  ),
                  reference: values.payment.reference || undefined,
                  paymentAlreadyMade: true,
                }
              : undefined,
          expenseAlreadyIncurred: true,
        })
        if (!result.success) {
          setError(
            result.error.issues[0]?.message ?? "Check the expense details.",
          )
          return
        }
        setError(null)
        onSave(result.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        Record an expense already incurred.{" "}
        {initial.payment
          ? `The reviewed ${initial.payment.funding === "OWNER_CAPITAL" ? "owner funding" : "business payment account"} stays selected.`
          : "This draft has no payment and records an amount owed."}{" "}
        This does not send money.
      </p>
      <FieldGroup>
        <ControlField label="Payee" error={errors.payee?.message}>
          <Input
            {...form.register("payee")}
            maxLength={160}
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Expense description"
          error={errors.description?.message}
        >
          <Textarea
            {...form.register("description")}
            maxLength={400}
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Expense reference"
          error={errors.reference?.message}
        >
          <Input
            {...form.register("reference")}
            maxLength={160}
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Incurred date and time (UTC)"
          error={errors.incurred?.message}
        >
          <Input
            {...form.register("incurred")}
            type="datetime-local"
            step="1"
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Due date and time (UTC, optional)"
          error={errors.due?.message}
        >
          <Input
            {...form.register("due")}
            type="datetime-local"
            step="1"
            disabled={disabled}
          />
        </ControlField>
      </FieldGroup>
      {initial.lines.map((line, index) => (
        <fieldset
          key={`${line.accountId}:${index}`}
          className="grid gap-3 border p-3"
        >
          <legend className="px-1 text-sm font-medium">
            Expense line {index + 1}
          </legend>
          <ControlField
            label={`Line ${index + 1} description`}
            error={errors.lines?.[index]?.description?.message}
          >
            <Input
              {...form.register(`lines.${index}.description`)}
              maxLength={200}
              disabled={disabled}
            />
          </ControlField>
          <ControlField
            label={`Line ${index + 1} amount in reviewed currency`}
            error={errors.lines?.[index]?.amount?.message}
          >
            <Input
              {...form.register(`lines.${index}.amount`)}
              inputMode="decimal"
              disabled={disabled}
            />
          </ControlField>
        </fieldset>
      ))}
      {initial.payment ? (
        <fieldset className="grid gap-3 border p-3">
          <legend className="px-1 text-sm font-medium">
            Payment already made
          </legend>
          <ControlField
            label="Payment amount in reviewed currency"
            error={errors.payment?.amount?.message}
          >
            <Input
              {...form.register("payment.amount")}
              inputMode="decimal"
              disabled={disabled}
            />
          </ControlField>
          <ControlField
            label="Payment date and time (UTC)"
            error={errors.payment?.date?.message}
          >
            <Input
              {...form.register("payment.date")}
              type="datetime-local"
              step="1"
              disabled={disabled}
            />
          </ControlField>
          <ControlField
            label="Payment reference"
            error={errors.payment?.reference?.message}
          >
            <Input
              {...form.register("payment.reference")}
              maxLength={160}
              disabled={disabled}
            />
          </ControlField>
          <Controller
            control={form.control}
            name="payment.acknowledged"
            render={({ field }) => (
              <CheckboxField
                label="This payment was already made"
                error={errors.payment?.acknowledged?.message}
              >
                <Checkbox
                  checked={field.value ?? false}
                  onCheckedChange={(value) => field.onChange(value === true)}
                  disabled={disabled}
                />
              </CheckboxField>
            )}
          />
        </fieldset>
      ) : null}
      <Controller
        control={form.control}
        name="acknowledged"
        render={({ field }) => (
          <CheckboxField
            label="This expense was already incurred"
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
      <p className="text-sm text-muted-foreground">
        Ask for a new draft to change categories, funding, or add or remove
        payment. Saving shows a fresh review before confirmation.
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
