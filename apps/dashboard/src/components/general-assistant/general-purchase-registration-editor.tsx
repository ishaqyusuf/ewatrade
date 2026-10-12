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
type Action = Extract<GeneralAction, { action: "purchase_register" }>
const schema = z.object({
  description: z.string().trim().min(1).max(400),
  date: z
    .string()
    .refine(
      (value) => Number.isFinite(new Date(`${value}Z`).getTime()),
      "Choose a valid agreement date and time.",
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
    .refine(Boolean, "Confirm that this records an agreement only."),
})
function major(value: string) {
  const n = BigInt(value)
  return `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`
}
export function GeneralPurchaseRegistrationEditor({
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
  const originalDate = new Date(initial.agreedAt).toISOString().slice(0, 19)
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: {
      description: initial.description,
      date: originalDate,
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
          agreedAt: preserveReviewedTimestamp(
            new Date(`${values.date}Z`),
            initial.agreedAt,
          ),
          agreementOnly: true,
          lines: initial.lines.map((line, i) => ({
            ...line,
            description: values.lines[i]!.description,
            enteredQuantity: values.lines[i]!.quantity,
            amountMinor: parseFinanceMoney(values.lines[i]!.amount),
          })),
        })
        if (!result.success) {
          setError(
            result.error.issues[0]?.message ?? "Check the agreement details.",
          )
          return
        }
        setError(null)
        onSave(result.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        The reviewed supplier, Book, goods and units stay selected. Ask for a
        new draft to change these targets.
      </p>
      <FieldGroup>
        <ControlField
          label="Agreement description"
          error={errors.description?.message}
        >
          <Textarea
            {...form.register("description")}
            maxLength={400}
            disabled={disabled}
          />
        </ControlField>
        <ControlField
          label="Agreed date and time (UTC)"
          error={errors.date?.message}
        >
          <Input
            {...form.register("date")}
            type="datetime-local"
            step="1"
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
            label={`Goods ${i + 1} total agreed cost`}
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
            label="Record agreement only — no payable, payment or stock receipt"
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
