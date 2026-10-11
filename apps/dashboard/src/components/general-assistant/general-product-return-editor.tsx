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
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { useId, useState } from "react"

type ReturnAction = Extract<GeneralAction, { action: "product_line_return" }>
export function GeneralProductReturnEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: ReturnAction
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const [payload, setPayload] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled) return
        const parsed = generalActionSchema.safeParse(payload)
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the return details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      }}
    >
      <p className="text-sm text-muted-foreground">
        Return items from the selected fulfilled order line. Review the
        refreshed stock and cost details before confirming. This does not issue
        customer credit or refund cash.
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-quantity`}>
            Quantity in the sold unit
          </FieldLabel>
          <Input
            id={`${id}-quantity`}
            inputMode="decimal"
            value={payload.quantity}
            disabled={disabled}
            onChange={(event) =>
              setPayload({ ...payload, quantity: event.target.value })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-disposition`}>
            What happens to the items?
          </FieldLabel>
          <SelectControl
            id={`${id}-disposition`}
            value={payload.disposition}
            disabled={disabled}
            options={[
              { value: "restock", label: "Return to available stock" },
              { value: "damaged", label: "Damaged — do not restock" },
              { value: "quarantine", label: "Quarantine — do not restock" },
              {
                value: "no_restock",
                label: "Record return without restocking",
              },
            ]}
            onValueChange={(value) => {
              if (
                value !== "restock" &&
                value !== "damaged" &&
                value !== "quarantine" &&
                value !== "no_restock"
              )
                return
              setPayload({
                ...payload,
                disposition: value,
                destinationBalanceSourceId:
                  value === "restock"
                    ? initial.destinationBalanceSourceId
                    : undefined,
              })
            }}
          />
        </Field>
        {payload.disposition === "restock" ? (
          initial.destinationBalanceSourceId ? (
            <Field>
              <FieldLabel htmlFor={`${id}-destination`}>
                Stock destination
              </FieldLabel>
              <SelectControl
                id={`${id}-destination`}
                disabled={disabled}
                value={
                  payload.destinationBalanceSourceId ? "reviewed" : "original"
                }
                options={[
                  { value: "reviewed", label: "Keep the reviewed destination" },
                  { value: "original", label: "Original stock source" },
                ]}
                onValueChange={(value) => {
                  if (value === "reviewed" || value === "original")
                    setPayload({
                      ...payload,
                      destinationBalanceSourceId:
                        value === "reviewed"
                          ? initial.destinationBalanceSourceId
                          : undefined,
                    })
                }}
              />
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">
              Items return to their original stock source. To choose another
              destination, ask the assistant before confirming.
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Available stock will not increase.
          </p>
        )}
        <Field>
          <FieldLabel htmlFor={`${id}-reason`}>Reason for return</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            value={payload.reason}
            disabled={disabled}
            maxLength={500}
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
