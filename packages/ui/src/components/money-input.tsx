"use client"

import { getCurrencySymbol } from "@ewatrade/utils"
import type { ComponentProps, ReactNode } from "react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "./input-group"

export function CurrencyInputGroup({
  currencyCode,
  className,
  disabled,
  children,
}: {
  currencyCode: string
  className?: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <InputGroup
      appearance="form"
      className={className}
      data-disabled={disabled || undefined}
    >
      {children}
      <InputGroupAddon align="inline-start">
        <InputGroupText aria-hidden="true" title={currencyCode}>
          {currencyCode ? getCurrencySymbol(currencyCode) : "…"}
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

/** Currency stays outside the editable amount, including native form submission. */
export function MoneyInput({
  currencyCode,
  className,
  disabled,
  ...props
}: ComponentProps<typeof InputGroupInput> & { currencyCode: string }) {
  return (
    <CurrencyInputGroup
      currencyCode={currencyCode}
      className={className}
      disabled={disabled}
    >
      <InputGroupInput
        aria-description={`Currency ${currencyCode}`}
        inputMode="decimal"
        {...props}
        disabled={disabled}
      />
    </CurrencyInputGroup>
  )
}
