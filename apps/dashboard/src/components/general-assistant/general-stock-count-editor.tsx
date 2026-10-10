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
  { action: "stock_count_create" | "stock_count_finalize" }
>
export function GeneralStockCountEditor({
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
  function save() {
    if (disabled) return
    const parsed = generalActionSchema.safeParse(payload)
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Check the counted quantities.",
      )
      return
    }
    setError(null)
    onSave(parsed.data)
  }
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p className="text-sm text-muted-foreground">
        {payload.action === "stock_count_create"
          ? "Enter what you physically counted, including zero. The stock sources and units stay as shown in the review. Saving observations does not adjust stock."
          : "This finalizes the saved observations. To change a quantity, create a fresh count instead."}
      </p>
      <FieldGroup>
        {payload.action === "stock_count_create"
          ? payload.lines.map((line, lineIndex) => (
              <fieldset
                key={line.balanceSourceId}
                className="grid gap-3 rounded-md border p-3"
              >
                <legend className="px-1 text-sm font-medium">
                  Stock source {lineIndex + 1}
                </legend>
                {line.entries.map((entry, entryIndex) => (
                  <Field key={`${entry.enteredInventoryUnitId}:${entryIndex}`}>
                    <FieldLabel htmlFor={`count-${lineIndex}-${entryIndex}`}>
                      Counted quantity · observation {entryIndex + 1}
                    </FieldLabel>
                    <Input
                      id={`count-${lineIndex}-${entryIndex}`}
                      inputMode="decimal"
                      value={entry.enteredQuantity}
                      disabled={disabled}
                      onChange={(event) =>
                        setPayload({
                          ...payload,
                          lines: payload.lines.map((current, index) =>
                            index === lineIndex
                              ? {
                                  ...current,
                                  entries: current.entries.map(
                                    (observation, position) =>
                                      position === entryIndex
                                        ? {
                                            ...observation,
                                            enteredQuantity: event.target.value,
                                          }
                                        : observation,
                                  ),
                                }
                              : current,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
              </fieldset>
            ))
          : null}
        <Field>
          <FieldLabel htmlFor="stock-count-reason">Reason</FieldLabel>
          <Textarea
            id="stock-count-reason"
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
