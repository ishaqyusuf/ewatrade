"use client"

import { Button } from "@ewatrade/ui/button"
import { ButtonGroup } from "@ewatrade/ui/button-group"
import { Input } from "@ewatrade/ui/input"
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { stepQuantity } from "../commerce/model"

export function QuantityStepper({
  id,
  value,
  scale,
  onChange,
  label,
  invalid,
  describedBy,
  max,
}: {
  id: string
  value: string
  scale: number
  onChange: (value: string) => void
  label: string
  invalid?: boolean
  describedBy?: string
  max?: number
}) {
  const atMax = max !== undefined && Number(value) >= max
  return (
    <ButtonGroup className="sf-feature-stepper" aria-label={label}>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={Number(value) <= 1}
        onClick={() => onChange(stepQuantity(value, -1, scale))}
      >
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
      </Button>
      <Input
        id={id}
        className="sf-feature-stepper__input"
        value={value}
        inputMode={scale > 0 ? "decimal" : "numeric"}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) =>
          onChange(event.target.value.replace(/[^\d.]/g, "").slice(0, 11))
        }
      />
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={atMax}
        onClick={() => onChange(stepQuantity(value, 1, scale))}
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
      </Button>
    </ButtonGroup>
  )
}
