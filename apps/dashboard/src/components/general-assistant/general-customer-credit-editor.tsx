"use client"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { Button, ControlField, FieldGroup, Input, Textarea } from "@ewatrade/ui"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { useState } from "react"
import { z } from "zod"
type Action = Extract<
  GeneralAction,
  { action: "customer_credit_apply" | "customer_allocation_release" }
>
const fieldsSchema = z.object({
  amount: z.string().refine((value) => {
    try {
      parseFinanceMoney(value)
      return true
    } catch {
      return false
    }
  }, "Enter a positive amount with up to two decimal places."),
  reason: z.string().trim().max(400),
})
export function GeneralCustomerCreditEditor({
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
  const amount = BigInt(initial.amountMinor)
  const release = initial.action === "customer_allocation_release"
  const form = useZodForm<z.infer<typeof fieldsSchema>>(fieldsSchema, {
    defaultValues: {
      amount: `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`,
      reason: release ? initial.reason : "",
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
          ...(release ? { reason: values.reason } : {}),
        })
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the credit details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      })}
    >
      <p className="text-sm text-muted-foreground">
        {release
          ? "Release existing allocated credit. This restores available credit and debt; it does not refund money."
          : "Apply existing customer credit to the selected posted debt. This does not collect new money."}
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
        {release ? (
          <ControlField
            label="Reason for releasing the allocation"
            error={form.formState.errors.reason?.message}
          >
            <Textarea
              {...form.register("reason")}
              maxLength={400}
              disabled={disabled}
            />
          </ControlField>
        ) : null}
      </FieldGroup>
      <p className="text-sm text-muted-foreground">
        The reviewed customer and sources stay selected. Ask the assistant for a
        new draft to change them. Saving refreshes the review before
        confirmation.
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
