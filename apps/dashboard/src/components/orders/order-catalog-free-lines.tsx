"use client"

import { Button, ControlField, Input, MoneyInput } from "@ewatrade/ui"
import {
  CATALOG_FREE_DESCRIPTION_MAX_LENGTH,
  CATALOG_FREE_LINE_LABELS,
  type CatalogFreeLineDraft,
  type CatalogFreeLineKind,
  catalogFreeLineDescriptionError,
} from "@ewatrade/utils/catalog-free-lines"
import { Add01Icon, Cancel01Icon, Edit02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useRef } from "react"

/** Skip-catalog lines: a typed price (Quick sale) or an Additional cost. */
export function OrderCatalogFreeLines({
  lines,
  currencyCode,
  disabled,
  onChange,
  validationAttempt = 0,
}: {
  lines: CatalogFreeLineDraft[]
  currencyCode: string
  disabled: boolean
  onChange: (lines: CatalogFreeLineDraft[]) => void
  /** Increments on each blocked submit: show line errors, focus the first. */
  validationAttempt?: number
}) {
  const descriptions = useRef(new Map<string, HTMLInputElement>())
  // Errors appear after a submit attempt and follow typing from then on.
  const descriptionError = (line: CatalogFreeLineDraft) =>
    validationAttempt ? catalogFreeLineDescriptionError(line) : null
  const latest = useRef(lines)
  latest.current = lines
  useEffect(() => {
    if (!validationAttempt) return
    const first = latest.current.find((line) =>
      catalogFreeLineDescriptionError(line),
    )
    const input = first && descriptions.current.get(first.id)
    if (!input) return
    input.focus()
    input.scrollIntoView?.({ block: "center" })
  }, [validationAttempt])
  function add(kind: CatalogFreeLineKind) {
    onChange([
      ...lines,
      { amount: "", description: "", id: crypto.randomUUID(), kind },
    ])
  }
  function update(id: string, patch: Partial<CatalogFreeLineDraft>) {
    onChange(
      lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    )
  }
  return (
    <div className="grid gap-3">
      {lines.map((line, index) => {
        const label = CATALOG_FREE_LINE_LABELS[line.kind]
        return (
          <fieldset
            key={line.id}
            disabled={disabled}
            className="min-w-0 space-y-3 border border-border p-4"
          >
            <legend className="sr-only">
              {label} {index + 1}
            </legend>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{label}</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${label} ${index + 1}`}
                onClick={() =>
                  onChange(lines.filter((row) => row.id !== line.id))
                }
                disabled={disabled}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ControlField
                label={line.kind === "quick_sale" ? "Price" : "Cost"}
              >
                <MoneyInput
                  autoFocus={!line.amount}
                  currencyCode={currencyCode}
                  placeholder="0.00"
                  required
                  value={line.amount}
                  onChange={(event) =>
                    update(line.id, { amount: event.target.value })
                  }
                />
              </ControlField>
              <ControlField
                label={
                  line.kind === "quick_sale"
                    ? "What was sold? (required)"
                    : "Description (optional)"
                }
                error={descriptionError(line) ?? undefined}
              >
                <Input
                  ref={(input) => {
                    if (input) descriptions.current.set(line.id, input)
                    else descriptions.current.delete(line.id)
                  }}
                  // Room for padding; the canonical check trims to 1–200.
                  maxLength={CATALOG_FREE_DESCRIPTION_MAX_LENGTH + 40}
                  required={line.kind === "quick_sale"}
                  placeholder={
                    line.kind === "quick_sale"
                      ? "What was sold?"
                      : "What is this cost for?"
                  }
                  value={line.description}
                  onChange={(event) =>
                    update(line.id, { description: event.target.value })
                  }
                />
              </ControlField>
            </div>
          </fieldset>
        )
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => add("quick_sale")}
        >
          <HugeiconsIcon icon={Edit02Icon} className="size-4" />
          Type a price
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => add("additional_cost")}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Additional cost
        </Button>
      </div>
    </div>
  )
}
