"use client"

import {
  Checkbox,
  DateControl,
  type DateControlProps,
  SelectControl,
  type SelectControlProps,
} from "@ewatrade/ui"
import type { ComponentProps } from "react"
import {
  type Control,
  type FieldPathByValue,
  type FieldValues,
  useController,
} from "react-hook-form"

type StringField<T extends FieldValues> = {
  control: Control<T>
  name: FieldPathByValue<T, string | undefined>
}

export function FormSelectControl<T extends FieldValues>({
  control,
  name,
  ...props
}: StringField<T> &
  Omit<
    SelectControlProps,
    "name" | "value" | "defaultValue" | "onValueChange"
  >) {
  const { field, fieldState } = useController({ control, name })
  return (
    <SelectControl
      {...props}
      name={field.name}
      value={typeof field.value === "string" ? field.value : ""}
      ref={field.ref}
      onValueChange={field.onChange}
      onBlur={field.onBlur}
      aria-invalid={fieldState.invalid || props["aria-invalid"]}
      disabled={field.disabled || props.disabled}
    />
  )
}

export function FormDateControl<T extends FieldValues>({
  control,
  name,
  ...props
}: StringField<T> &
  Omit<DateControlProps, "name" | "value" | "onValueChange">) {
  const { field, fieldState } = useController({ control, name })
  return (
    <DateControl
      {...props}
      name={field.name}
      value={typeof field.value === "string" ? field.value : ""}
      ref={field.ref}
      onValueChange={field.onChange}
      onBlur={field.onBlur}
      aria-invalid={fieldState.invalid || props["aria-invalid"]}
      disabled={field.disabled || props.disabled}
    />
  )
}

export function FormCheckboxControl<T extends FieldValues>({
  control,
  name,
  value,
  ...props
}: {
  control: Control<T>
  name: FieldPathByValue<T, boolean | string[] | undefined>
} & Omit<
  ComponentProps<typeof Checkbox>,
  "name" | "checked" | "defaultChecked" | "onCheckedChange"
>) {
  const { field, fieldState } = useController({ control, name })
  return (
    <Checkbox
      {...props}
      name={field.name}
      value={value}
      ref={field.ref}
      checked={
        Array.isArray(field.value)
          ? field.value.includes(value)
          : Boolean(field.value)
      }
      onCheckedChange={(checked) => {
        if (Array.isArray(field.value)) {
          field.onChange(
            checked
              ? [...new Set([...field.value, value])]
              : field.value.filter((item: unknown) => item !== value),
          )
        } else field.onChange(checked)
      }}
      onBlur={field.onBlur}
      disabled={field.disabled || props.disabled}
      aria-invalid={fieldState.invalid || props["aria-invalid"]}
    />
  )
}
