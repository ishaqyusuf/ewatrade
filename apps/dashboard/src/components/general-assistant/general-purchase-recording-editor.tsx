"use client"
import { preserveReviewedTimestamp } from "./posting-date"
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
type Action = Extract<GeneralAction, { action: "purchase_record" }>
const schema = z.object({
  description: z.string().trim().min(1).max(400),
  date: z
    .string()
    .refine(
      (value) => Number.isFinite(new Date(`${value}Z`).getTime()),
      "Choose a valid bill date and time.",
    ),
  reference: z.string().trim().max(160),
  due: z
    .string()
    .refine(
      (v) => !v || Number.isFinite(new Date(`${v}Z`).getTime()),
      "Choose a valid due date and time.",
    ),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        quantity: z
          .string()
          .regex(/^\d{1,12}(\.\d{1,6})?$/)
          .refine(
            (value) => Number(value) > 0,
            "Enter a positive exact quantity.",
          ),
        amount: z.string().refine((value) => {
          try {
            parseFinanceMoney(value)
            return true
          } catch {
            return false
          }
        }, "Enter a positive total cost with up to two decimal places."),
      }),
    )
    .min(1)
    .max(10),
  acknowledged: z
    .boolean()
    .refine(
      Boolean,
      "Confirm the supplier invoice, ownership and receipt of all goods.",
    ),
})
function major(value: string) {
  const n = BigInt(value)
  return `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`
}
export function GeneralPurchaseRecordingEditor({
  initial,
  disabled,
  currencyCode,
  onSave,
  onCancel,
}: {
  initial: Action
  disabled: boolean
  currencyCode: string
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const originalDate = new Date(initial.incurredAt).toISOString().slice(0, 19)
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: {
      description: initial.description,
      date: originalDate,
      reference: initial.reference ?? "",
      due: initial.dueAt
        ? new Date(initial.dueAt).toISOString().slice(0, 19)
        : "",
      acknowledged: false,
      lines: initial.lines.map((line) => ({
        description: line.description,
        quantity: line.enteredQuantity,
        amount: major(line.amountMinor),
      })),
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
        const result = generalActionSchema.safeParse({
          ...initial,
          description: values.description,
          reference: values.reference || undefined,
          dueAt: values.due
            ? preserveReviewedTimestamp(
                new Date(`${values.due}Z`),
                initial.dueAt ?? new Date(`${values.due}Z`).toISOString(),
              )
            : undefined,
          incurredAt: preserveReviewedTimestamp(
            new Date(`${values.date}Z`),
            initial.incurredAt,
          ),
          invoiceOwnershipReceiptConfirmed: true,
          lines: initial.lines.map((line, i) => ({
            ...line,
            description: values.lines[i]!.description,
            enteredQuantity: values.lines[i]!.quantity,
            amountMinor: parseFinanceMoney(values.lines[i]!.amount),
          })),
        })
        if (!result.success) {
          setError(
            result.error.issues[0]?.message ??
              "Check the received purchase details.",
          )
          return
        }
        setError(null)
        onSave(result.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        The reviewed supplier, Book, goods and units stay selected. Ask for a
        new draft to change these targets. Saving will rebuild the bill,
        payable, stock and valuation review.
      </p>
      <FieldGroup>
        <ControlField
          label="Purchase description"
          error={errors.description?.message}
        >
          <Textarea
            {...form.register("description")}
            maxLength={400}
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Bill date and time (UTC)"
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
          label="Due date and time (UTC), optional"
          error={errors.due?.message}
        >
          <Input
            {...form.register("due")}
            type="datetime-local"
            step="1"
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Reference, optional"
          error={errors.reference?.message}
        >
          <Input
            {...form.register("reference")}
            maxLength={160}
            disabled={disabled}
          />
        </ControlField>
      </FieldGroup>
      {initial.lines.map((line, i) => (
        <fieldset
          key={line.balanceSourceId}
          className="grid gap-4 rounded-lg border p-4"
        >
          <legend className="px-1 text-sm font-medium">
            Goods {i + 1} · {line.description}
          </legend>
          <ControlField
            label={`Goods ${i + 1} description`}
            error={errors.lines?.[i]?.description?.message}
          >
            <Input
              {...form.register(`lines.${i}.description`)}
              maxLength={200}
              disabled={disabled}
            />
          </ControlField>
          <ControlField
            label={`Goods ${i + 1} quantity in reviewed unit`}
            error={errors.lines?.[i]?.quantity?.message}
          >
            <Input
              {...form.register(`lines.${i}.quantity`)}
              inputMode="decimal"
              disabled={disabled}
            />
          </ControlField>
          <ControlField
            label={`Goods ${i + 1} total purchase cost (${currencyCode})`}
            error={errors.lines?.[i]?.amount?.message}
          >
            <Input
              {...form.register(`lines.${i}.amount`)}
              inputMode="decimal"
              disabled={disabled}
            />
          </ControlField>
        </fieldset>
      ))}
      <Controller
        control={form.control}
        name="acknowledged"
        render={({ field }) => (
          <CheckboxField
            label="The supplier invoice exists and we received and own all these goods"
            error={errors.acknowledged?.message}
          >
            <Checkbox
              checked={field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
              disabled={disabled}
            />
          </CheckboxField>
        )}
      />
      <p className="text-sm text-muted-foreground">
        This increases supplier payable and received stock together, using
        original purchase cost. No payment or transfer occurs.
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
