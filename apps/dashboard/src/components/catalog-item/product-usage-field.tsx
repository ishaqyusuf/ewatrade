"use client"

import { Field, FieldLabel, SelectControl } from "@ewatrade/ui"
import {
  type ProductUsage,
  productUsageLabels,
  productUsages,
} from "@ewatrade/utils/product-usage"

export function ProductUsageField({
  value,
  onChange,
  disabled = false,
}: {
  value: ProductUsage
  onChange: (usage: ProductUsage) => void
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel htmlFor="product-usage">Product usage</FieldLabel>
      <SelectControl
        id="product-usage"
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const usage = productUsages.find((candidate) => candidate === next)
          if (usage) onChange(usage)
        }}
        options={productUsages.map((usage) => ({
          value: usage,
          label: productUsageLabels[usage],
        }))}
      />
      <p className="text-sm text-muted-foreground">
        {value === "INTERNAL_USE"
          ? "Track purchases and stock for business use. Hidden from customer orders."
          : value === "BOTH"
            ? "Sell to customers and use within the business."
            : "Available for customer orders."}
      </p>
    </Field>
  )
}
