"use client"
import type { GeneralCashCountAction } from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  Input,
} from "@ewatrade/ui"
import { useState } from "react"
import { cashCountEditorPayload } from "./cash-count-editor-values"

export function GeneralCashCountEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: GeneralCashCountAction
  disabled: boolean
  onSave: (payload: GeneralCashCountAction) => void
  onCancel: () => void
}) {
  const minor = BigInt(initial.observedBalanceMinor)
  const [amount, setAmount] = useState(
    `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`,
  )
  const [date, setDate] = useState(
    new Date(initial.asOf).toISOString().slice(0, 19),
  )
  const [reference, setReference] = useState(initial.reference)
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled) return
        try {
          const payload = cashCountEditorPayload(initial, {
            amount,
            date,
            reference,
            acknowledged,
          })
          setError(null)
          onSave(payload)
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Check the count details.",
          )
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        The reviewed cash account and Finance Book stay selected. Ask for a new
        draft to change them.
      </p>
      <ControlField label="Cash physically counted (reviewed currency)">
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          disabled={disabled}
        />
      </ControlField>
      <ControlField label="Count date and time (UTC)">
        <Input
          type="datetime-local"
          step="1"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          disabled={disabled}
        />
      </ControlField>
      <ControlField label="Count reference">
        <Input
          value={reference}
          maxLength={200}
          onChange={(event) => setReference(event.target.value)}
          disabled={disabled}
        />
      </ControlField>
      <CheckboxField label="This cash was physically counted">
        <Checkbox
          checked={acknowledged}
          onCheckedChange={(value) => setAcknowledged(value === true)}
          disabled={disabled}
        />
      </CheckboxField>
      <p className="border border-border p-4 text-sm">
        Zero is a valid observation. Saving returns to a fresh review.
        Confirmation records the count and its difference; it does not adjust
        cash or close the day.
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
