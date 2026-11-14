"use client"

import { Field, FieldLabel, SelectControl } from "@ewatrade/ui"
import {
  type ProductUsage,
  productUsageDescriptions,
  productUsageLabels,
  selectableProductUsages,
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
          const usage = selectableProductUsages.find(
            (candidate) => candidate === next,
          )
          if (usage) onChange(usage)
        }}
        options={selectableProductUsages.map((usage) => ({
          value: usage,
          label: productUsageLabels[usage],
        }))}
      />
      <p className="text-sm text-muted-foreground">
        {productUsageDescriptions[value]}
      </p>
    </Field>
  )
}
