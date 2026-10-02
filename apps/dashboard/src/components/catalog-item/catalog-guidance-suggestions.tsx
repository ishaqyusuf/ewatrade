"use client"

import { Button } from "@ewatrade/ui"

export function CatalogGuidanceSuggestions({
  label,
  values,
  disabled,
  onSelect,
}: {
  label: string
  values: readonly string[]
  disabled?: boolean
  onSelect: (value: string) => void
}) {
  if (!values.length) return null
  return (
    <fieldset className="flex flex-wrap gap-2" aria-label={label}>
      {values.map((value) => (
        <Button
          appearance="form"
          key={value}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onSelect(value)}
        >
          {value}
        </Button>
      ))}
    </fieldset>
  )
}
