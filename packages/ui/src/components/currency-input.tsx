"use client"

import { getCurrencySymbol } from "@ewatrade/utils"
import type { ComponentProps } from "react"
import { type NumberFormatValues, NumericFormat } from "react-number-format"

type CurrencyInputProps = Omit<
  ComponentProps<typeof NumericFormat>,
  "decimalScale" | "onValueChange" | "prefix" | "thousandSeparator" | "value"
> & {
  currencyCode: string
  onValueChange: (value: string, values: NumberFormatValues) => void
  value: string
}

export function CurrencyInput({
  allowNegative = false,
  currencyCode,
  onValueChange,
  value,
  ...props
}: CurrencyInputProps) {
  return (
    <NumericFormat
      allowNegative={allowNegative}
      decimalScale={2}
      inputMode="decimal"
      onValueChange={(values) => onValueChange(values.value, values)}
      prefix={`${getCurrencySymbol(currencyCode)} `}
      thousandSeparator=","
      value={value}
      valueIsNumericString
      {...props}
    />
  )
}
