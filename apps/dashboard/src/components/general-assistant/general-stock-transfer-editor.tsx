"use client"

import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@ewatrade/ui"
import { useState } from "react"

type Action = Extract<
  GeneralAction,
  {
    action:
      | "stock_transfer_dispatch"
      | "stock_transfer_receive"
      | "stock_transfer_cancel"
  }
>

export function GeneralStockTransferEditor({
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
  const [payload, setPayload] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled) return
        const parsed = generalActionSchema.safeParse(payload)
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the transfer details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      }}
    >
      <p className="text-sm text-muted-foreground">
        {payload.action === "stock_transfer_dispatch"
          ? "Update the quantity to send, then review the source stock and destination before confirming. Receipt is a separate step."
          : payload.action === "stock_transfer_receive"
            ? "Enter the quantity that actually arrived. Any outstanding quantity stays in transit."
            : "Cancellation returns all remaining transit stock to the source Store. Earlier receipts remain recorded."}
      </p>
      <FieldGroup>
        {payload.action !== "stock_transfer_cancel" ? (
          <Field>
            <FieldLabel htmlFor="transfer-quantity">
              {payload.action === "stock_transfer_receive"
                ? "Quantity received"
                : "Quantity to send"}
            </FieldLabel>
            <Input
              id="transfer-quantity"
              inputMode="decimal"
              value={payload.quantity}
              disabled={disabled}
              onChange={(event) =>
                setPayload({ ...payload, quantity: event.target.value })
              }
            />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="transfer-reason">Reason</FieldLabel>
          <Textarea
            id="transfer-reason"
            value={payload.reason}
            maxLength={500}
            disabled={disabled}
            onChange={(event) =>
              setPayload({ ...payload, reason: event.target.value })
            }
          />
        </Field>
      </FieldGroup>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={disabled}>
          Save draft
        </Button>
      </div>
    </form>
  )
}
