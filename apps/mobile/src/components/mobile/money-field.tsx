import {
  formatCurrencyInput,
  getCurrencySymbol,
  normalizeCurrencyInput,
} from "@ewatrade/utils"
import type { ComponentProps } from "react"

import { FormField } from "./form-field"

type MoneyFieldProps = Omit<
  ComponentProps<typeof FormField>,
  "keyboardType" | "leadingIcon" | "leadingText" | "onChangeText" | "value"
> & {
  currencyCode: string
  onChangeValue: (value: string) => void
  value: string
}

export function MoneyField({
  currencyCode,
  onChangeValue,
  value,
  ...props
}: MoneyFieldProps) {
  return (
    <FormField
      keyboardType="decimal-pad"
      leadingText={getCurrencySymbol(currencyCode)}
      onChangeText={(nextValue) =>
        onChangeValue(normalizeCurrencyInput(nextValue))
      }
      value={formatCurrencyInput(value)}
      {...props}
    />
  )
}
