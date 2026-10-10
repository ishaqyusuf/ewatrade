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
import { useId, useState } from "react"

type Action = Extract<
  GeneralAction,
  { action: "inventory_closeout_create" | "inventory_closeout_finalize" }
>
export function GeneralCloseoutEditor({
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
  const id = useId()
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled) return
        const parsed = generalActionSchema.safeParse(payload)
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the declarations.")
          return
        }
        setError(null)
        onSave(parsed.data)
      }}
    >
      <p className="text-sm text-muted-foreground">
        {payload.action === "inventory_closeout_create"
          ? "Enter the physical quantity, including zero, in each source’s inventory unit shown in the review. Saving declarations does not adjust stock. You will review the refreshed proposal before confirming."
          : "Finalization applies the saved declarations. To change quantities, record fresh declarations instead. You will review the refreshed proposal before confirming."}
      </p>
      <FieldGroup>
        {payload.action === "inventory_closeout_create" ? (
          payload.declarations.map((line, index) => (
            <Field key={line.balanceSourceId}>
              <FieldLabel htmlFor={`${id}-${index}`}>
                Declared quantity · source {index + 1}
              </FieldLabel>
              <p className="text-xs text-muted-foreground break-all">
                {line.balanceSourceId}
              </p>
              <Input
                id={`${id}-${index}`}
                inputMode="decimal"
                value={line.declaredQuantity}
                disabled={disabled}
                onChange={(event) =>
                  setPayload({
                    ...payload,
                    declarations: payload.declarations.map(
                      (current, position) =>
                        position === index
                          ? { ...current, declaredQuantity: event.target.value }
                          : current,
                    ),
                  })
                }
              />
            </Field>
          ))
        ) : (
          <p className="text-xs text-muted-foreground break-all">
            Closeout {payload.closeoutId}
          </p>
        )}
        <Field>
          <FieldLabel htmlFor={`${id}-reason`}>Reason</FieldLabel>
          <Textarea
            id={`${id}-reason`}
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
