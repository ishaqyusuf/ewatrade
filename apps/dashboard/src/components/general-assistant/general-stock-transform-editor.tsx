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

type Action = Extract<GeneralAction, { action: "stock_package_transform" }>

/** The drafted repack with an edited quantity and reason; endpoints fixed. */
export function editedTransform(
  draft: Action,
  edits: { sourceQuantity: string; reason: string },
) {
  const parsed = generalActionSchema.safeParse({ ...draft, ...edits })
  return parsed.success
    ? { ok: true as const, payload: parsed.data }
    : {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Check the repack details.",
      }
}

/**
 * Edits a drafted repack. Both pack balances stay exactly as drafted; only
 * the source quantity and reason change. The server derives the target
 * quantity and re-reviews both balances before confirmation.
 */
export function GeneralStockTransformEditor({
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
  const [sourceQuantity, setSourceQuantity] = useState(initial.sourceQuantity)
  const [reason, setReason] = useState(initial.reason)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled) return
        const result = editedTransform(initial, { sourceQuantity, reason })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setError(null)
        onSave(result.payload)
      }}
    >
      <p className="text-sm text-muted-foreground">
        Enter how many source packs to open. The review shows exactly what they
        become and both balances before you confirm. Record any loss separately.
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="transform-quantity">
            Source packs to repack
          </FieldLabel>
          <Input
            id="transform-quantity"
            inputMode="decimal"
            value={sourceQuantity}
            disabled={disabled}
            onChange={(event) => setSourceQuantity(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="transform-reason">Reason</FieldLabel>
          <Textarea
            id="transform-reason"
            value={reason}
            maxLength={500}
            disabled={disabled}
            onChange={(event) => setReason(event.target.value)}
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
