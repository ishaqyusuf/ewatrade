"use client"

import type { ComponentProps, ReactNode, Ref } from "react"
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "./select-menu"

export type SelectOption<Value extends string | number = string> = {
  value: Value
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}

export type SelectControlProps<Value extends string | number = string> = Omit<
  ComponentProps<typeof SelectTrigger>,
  "value" | "defaultValue" | "onChange" | "children"
> & {
  options: SelectOption<Value>[]
  value?: Value
  defaultValue?: Value
  onValueChange?: (value: Value) => void
  name?: string
  required?: boolean
  inputRef?: Ref<HTMLInputElement>
  popupClassName?: string
  placeholder?: string
}

export function SelectControl<Value extends string | number = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  inputRef,
  placeholder = "Choose an option",
  popupClassName,
  disabled,
  id,
  ...triggerProps
}: SelectControlProps<Value>) {
  return (
    <SelectRoot<Value>
      items={options}
      value={value}
      defaultValue={
        value === undefined ? (defaultValue ?? options[0]?.value) : undefined
      }
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next)
      }}
      name={name}
      required={required}
      inputRef={inputRef}
      disabled={disabled}
      id={id}
    >
      <SelectTrigger appearance="form" {...triggerProps}>
        <SelectValue
          placeholder={
            options.find((option) => option.value === "")?.label ?? placeholder
          }
        />
      </SelectTrigger>
      <SelectContent
        appearance="dashboard"
        className={popupClassName}
        alignItemWithTrigger={false}
        align="start"
      >
        <SelectGroup>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.description ? (
                <span className="flex min-w-0 flex-col gap-1">
                  <span>{option.label}</span>
                  <span className="text-xs font-normal text-foreground/80">
                    {option.description}
                  </span>
                </span>
              ) : (
                option.label
              )}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </SelectRoot>
  )
}
