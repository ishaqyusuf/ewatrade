"use client"
import {
  type CatalogArchiveAction,
  catalogArchiveAction,
} from "@ewatrade/assistant/general/contracts"
import { Button, ControlField, FieldGroup, Textarea } from "@ewatrade/ui"
import { useState } from "react"

type Props = {
  initial: CatalogArchiveAction
  /** Server review lines; line i + 1 names target i. */
  review?: string[]
  disabled: boolean
  onSave: (value: CatalogArchiveAction) => void
  onCancel: () => void
}

/** Narrow the drafted archive or change its reason; the server re-reviews. */
export function GeneralCatalogArchiveEditor(props: Props) {
  const [payload, setPayload] = useState(props.initial)
  const [error, setError] = useState<string | null>(null)
  const label = (index: number) => {
    const target = props.initial.targets[index]
    const line = props.review?.[index + 1]
    return line?.startsWith("Archive ")
      ? line.replace(/^Archive /, "")
      : target?.kind === "variant"
        ? "Variant"
        : "Selling unit"
  }
  const kept = new Set(payload.targets.map((target) => JSON.stringify(target)))
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (props.disabled) return
        const parsed = catalogArchiveAction.safeParse(payload)
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the archive.")
          return
        }
        setError(null)
        props.onSave(parsed.data)
      }}
    >
      <p className="text-sm text-muted-foreground">
        Remove anything you want to keep selling, then review the refreshed
        archive before confirming.
      </p>
      <FieldGroup>
        <ul className="grid gap-2">
          {props.initial.targets.map((target, index) => {
            const key = JSON.stringify(target)
            const included = kept.has(key)
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span
                  className={
                    included ? "" : "text-muted-foreground line-through"
                  }
                >
                  {label(index)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={props.disabled}
                  onClick={() =>
                    setPayload({
                      ...payload,
                      targets: included
                        ? payload.targets.filter(
                            (row) => JSON.stringify(row) !== key,
                          )
                        : props.initial.targets.filter(
                            (row) =>
                              kept.has(JSON.stringify(row)) ||
                              JSON.stringify(row) === key,
                          ),
                    })
                  }
                >
                  {included ? "Keep selling" : "Archive"}
                </Button>
              </li>
            )
          })}
        </ul>
        <ControlField label="Reason">
          <Textarea
            value={payload.reason}
            maxLength={500}
            disabled={props.disabled}
            onChange={(event) =>
              setPayload({ ...payload, reason: event.target.value })
            }
          />
        </ControlField>
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
          disabled={props.disabled}
          onClick={props.onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={props.disabled}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
