"use client"

import type { ComponentProps } from "react"
import { type NumberFormatValues, NumericFormat } from "react-number-format"

import { InputGroupInput } from "./input-group"
import { CurrencyInputGroup } from "./money-input"

type CurrencyInputProps = Omit<
  ComponentProps<typeof NumericFormat>,
  | "customInput"
  | "decimalScale"
  | "onValueChange"
  | "prefix"
  | "thousandSeparator"
  | "value"
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
  className,
  disabled,
  ...props
}: CurrencyInputProps) {
  return (
    <CurrencyInputGroup
      currencyCode={currencyCode}
      className={className}
      disabled={disabled}
    >
      <NumericFormat<ComponentProps<typeof InputGroupInput>>
        customInput={InputGroupInput}
        aria-description={`Currency ${currencyCode}`}
        disabled={disabled}
        allowNegative={allowNegative}
        decimalScale={2}
        inputMode="decimal"
        onValueChange={(values) => onValueChange(values.value, values)}
        thousandSeparator=","
        value={value}
        valueIsNumericString
        {...props}
      />
    </CurrencyInputGroup>
  )
}
