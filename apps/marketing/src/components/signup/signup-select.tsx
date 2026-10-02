"use client"

import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@ewatrade/ui"
import type { Ref } from "react"

type SignupSelectProps = {
  id: string
  name: string
  value: string
  options: { value: string; label: string }[]
  placeholder?: string
  invalid?: boolean
  onValueChange: (value: string) => void
  onBlur: () => void
  triggerRef: Ref<HTMLButtonElement>
}

export function SignupSelect({
  id,
  name,
  value,
  options,
  placeholder,
  invalid,
  onValueChange,
  onBlur,
  triggerRef,
}: SignupSelectProps) {
  return (
    <SelectRoot
      name={name}
      value={value || null}
      items={options}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next)
      }}
    >
      <SelectTrigger
        id={id}
        ref={triggerRef}
        onBlur={onBlur}
        aria-invalid={invalid}
        className="signup-input"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        className="signup-select-menu"
      >
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </SelectRoot>
  )
}
