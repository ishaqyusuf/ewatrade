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
import { format } from "date-fns"
import { useState } from "react"
type Action = Extract<
  GeneralAction,
  { action: "stock_adjust" | "stock_correct" }
>
export function GeneralStockAdjustmentEditor({
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
  const [effective, setEffective] = useState(
    format(
      new Date(
        initial.action === "stock_adjust"
          ? (initial.effectiveAt ?? Date.now())
          : Date.now(),
      ),
      "yyyy-MM-dd'T'HH:mm",
    ),
  )
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled) return
        const date = new Date(effective)
        if (
          payload.action === "stock_adjust" &&
          !Number.isFinite(date.getTime())
        ) {
          setError("Choose a valid effective date and time.")
          return
        }
        const parsed = generalActionSchema.safeParse(
          payload.action === "stock_adjust"
            ? { ...payload, effectiveAt: date.toISOString() }
            : payload,
        )
        if (!parsed.success) {
          setError(
            parsed.error.issues[0]?.message ?? "Check the stock details.",
          )
          return
        }
        setError(null)
        onSave(parsed.data)
      }}
    >
      <p className="text-sm text-muted-foreground">
        {payload.action === "stock_correct"
          ? "Update replacement quantities for the original movements. Their units and conversion factors remain as reviewed."
          : "Update the adjustment details, then review the resulting stock and cost before confirming."}
      </p>
      <FieldGroup>
        {payload.action === "stock_adjust" ? (
          <>
            <Field>
              <FieldLabel htmlFor="adjust-quantity">Quantity</FieldLabel>
              <Input
                id="adjust-quantity"
                inputMode="decimal"
                value={payload.enteredQuantity}
                disabled={disabled}
                onChange={(event) =>
                  setPayload({
                    ...payload,
                    enteredQuantity: event.target.value,
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="adjust-purpose">Purpose</FieldLabel>
              <SelectControl
                id="adjust-purpose"
                value={payload.purpose}
                disabled={disabled}
                options={[
                  { value: "adjustment", label: "Adjustment" },
                  { value: "waste", label: "Waste" },
                ]}
                onValueChange={(value) => {
                  if (value === "adjustment" || value === "waste")
                    setPayload({
                      ...payload,
                      purpose: value,
                      direction:
                        value === "waste" ? "decrease" : payload.direction,
                    })
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="adjust-direction">Direction</FieldLabel>
              <SelectControl
                id="adjust-direction"
                value={payload.direction}
                disabled={disabled || payload.purpose === "waste"}
                options={[
                  { value: "increase", label: "Increase" },
                  { value: "decrease", label: "Decrease" },
                ]}
                onValueChange={(value) => {
                  if (value === "increase" || value === "decrease")
                    setPayload({ ...payload, direction: value })
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="adjust-categories">
                Categories (comma separated)
              </FieldLabel>
              <Input
                id="adjust-categories"
                value={payload.categories
                  .map((category) => category.name)
                  .join(",")}
                disabled={disabled}
                onChange={(event) =>
                  setPayload({
                    ...payload,
                    categories: event.target.value
                      .split(",")
                      .map((name) => ({ name })),
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="adjust-date">
                Effective date and time
              </FieldLabel>
              <Input
                id="adjust-date"
                type="datetime-local"
                value={effective}
                disabled={disabled}
                onChange={(event) => setEffective(event.target.value)}
              />
            </Field>
          </>
        ) : (
          payload.corrections.map((entry, index) => (
            <Field key={entry.movementId}>
              <FieldLabel htmlFor={`correction-${index}`}>
                Replacement quantity · movement {index + 1}
              </FieldLabel>
              <Input
                id={`correction-${index}`}
                inputMode="decimal"
                disabled={disabled}
                value={entry.correctedEnteredQuantity}
                onChange={(event) =>
                  setPayload({
                    ...payload,
                    corrections: payload.corrections.map((current, position) =>
                      position === index
                        ? {
                            ...current,
                            correctedEnteredQuantity: event.target.value,
                          }
                        : current,
                    ),
                  })
                }
              />
            </Field>
          ))
        )}
        <Field>
          <FieldLabel htmlFor="adjust-reason">Reason</FieldLabel>
          <Textarea
            id="adjust-reason"
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
