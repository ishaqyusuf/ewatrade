"use client"

import type {
  InventoryQuantityBalance,
  InventoryQuantityUnit,
} from "@/lib/inventory-quantity"
import {
  inventoryQuantityTotal,
  normalizeQuantityInput,
} from "@/lib/inventory-quantity"
import { formatStockQuantity, pluralizeUnitName } from "@/lib/inventory-view"
import {
  Field,
  FieldDescription,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  SelectControl,
} from "@ewatrade/ui"
import { useId } from "react"

export function InventoryQuantityInput({
  label,
  quantity,
  onQuantityChange,
  unit,
  units,
  onUnitChange,
  balance,
  allowZero,
  disabled,
}: {
  label: string
  quantity: string
  onQuantityChange: (quantity: string) => void
  unit: InventoryQuantityUnit | undefined
  units: InventoryQuantityUnit[]
  onUnitChange: (unitId: string) => void
  balance: InventoryQuantityBalance | undefined
  allowZero: boolean
  disabled: boolean
}) {
  const id = useId()
  let total: string | null = null
  if (quantity.trim() && unit && balance) {
    try {
      total = inventoryQuantityTotal(
        normalizeQuantityInput(quantity),
        unit,
        balance,
        allowZero,
      ).balanceQuantity
    } catch {
      // Submit provides validation; incomplete decimals can still be typed.
    }
  }
  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup appearance="form" className="h-10">
        <InputGroupInput
          id={id}
          inputMode="decimal"
          value={quantity}
          maxLength={40}
          onChange={(event) => onQuantityChange(event.target.value)}
          aria-describedby={`${id}-total`}
          disabled={disabled}
        />
        <InputGroupAddon
          align="inline-end"
          className="border-l border-border py-0 pr-0"
        >
          <SelectControl
            aria-label="Unit"
            value={unit?.id ?? ""}
            onValueChange={onUnitChange}
            disabled={disabled || !balance || units.length < 2}
            className="h-9 w-auto min-w-24 border-0"
            options={
              units.length
                ? units.map((option) => ({
                    value: option.id,
                    label: option.name,
                  }))
                : [{ value: "", label: "Unit" }]
            }
          />
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription id={`${id}-total`} aria-live="polite">
        {!unit || !balance
          ? "Choose a product to see its units."
          : unit.id === balance.inventoryUnitId
            ? `In ${pluralizeUnitName(unit.name).toLowerCase()}.`
            : total
              ? `= ${formatStockQuantity(total, balance.inventoryUnitName)} (1 ${unit.name.toLowerCase()} = ${formatStockQuantity(unit.factor, balance.inventoryUnitName)})`
              : `1 ${unit.name.toLowerCase()} = ${formatStockQuantity(unit.factor, balance.inventoryUnitName)}.`}
      </FieldDescription>
    </Field>
  )
}
