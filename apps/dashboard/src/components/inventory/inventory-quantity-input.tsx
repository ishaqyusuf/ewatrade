"use client"

import type {
  InventoryQuantityBalance,
  InventoryQuantityUnit,
} from "@/lib/inventory-quantity"
import { inventoryQuantityTotal } from "@/lib/inventory-quantity"
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
        quantity,
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
            aria-label="Quantity unit"
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
        {total && balance ? (
          <>
            Total: {total} {balance.inventoryUnitName}
          </>
        ) : unit ? (
          <>Enter a quantity in {unit.name}.</>
        ) : (
          "Choose stock to see its units."
        )}
        {unit && balance && unit.id !== balance.inventoryUnitId ? (
          <>
            {" "}
            · 1 {unit.name} = {unit.factor} {balance.inventoryUnitName}
          </>
        ) : null}
      </FieldDescription>
    </Field>
  )
}
