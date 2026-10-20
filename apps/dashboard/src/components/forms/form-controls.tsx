"use client"

import {
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  DateControl,
  type DateControlProps,
  DatePicker,
  type DatePickerProps,
  SelectControl,
  type SelectControlProps,
} from "@ewatrade/ui"
import { type ComponentProps, useState } from "react"
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

/** shadcn date picker (Button + Popover + Calendar) for a YYYY-MM-DD field. */
export function FormDatePicker<T extends FieldValues>({
  control,
  name,
  ...props
}: StringField<T> & Omit<DatePickerProps, "value" | "onValueChange">) {
  const { field, fieldState } = useController({ control, name })
  return (
    <DatePicker
      {...props}
      value={typeof field.value === "string" ? field.value : ""}
      onValueChange={field.onChange}
      onBlur={field.onBlur}
      aria-invalid={fieldState.invalid || props["aria-invalid"]}
      disabled={field.disabled || props.disabled}
    />
  )
}

export type ComboOption = { value: string; label: string; hint?: string }

/**
 * Searchable pick (shadcn Combobox). With `createLabel`, typing a name that is
 * not listed offers "Add “name”" and stores the typed text as the value.
 */
export function FormCombobox<T extends FieldValues>({
  control,
  name,
  options,
  placeholder,
  empty = "No results.",
  createLabel,
  id,
}: StringField<T> & {
  options: ComboOption[]
  placeholder?: string
  empty?: string
  createLabel?: string
  id?: string
}) {
  const { field, fieldState } = useController({ control, name })
  const [query, setQuery] = useState("")
  const value = typeof field.value === "string" ? field.value : ""
  const typed = query.trim()
  const listed = (text: string) =>
    options.some((option) => option.label.toLowerCase() === text.toLowerCase())
  const items: (ComboOption & { created?: boolean })[] =
    createLabel && typed && !listed(typed)
      ? [...options, { value: typed, label: typed, created: true }]
      : options
  const selected =
    options.find((option) => option.value === value) ??
    (value ? { value, label: value } : null)
  return (
    <Combobox<ComboOption & { created?: boolean }>
      items={items}
      value={selected}
      itemToStringLabel={(option) => option.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      autoHighlight
      onInputValueChange={setQuery}
      onValueChange={(option) => field.onChange(option?.value ?? "")}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        aria-invalid={fieldState.invalid}
        onBlur={field.onBlur}
        className="w-full rounded-none border-border bg-transparent"
      />
      <ComboboxContent className="rounded-none border border-border bg-popover shadow-md ring-0 before:hidden **:data-[slot$=-item]:rounded-none">
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList>
          {(option: ComboOption & { created?: boolean }) => (
            <ComboboxItem
              key={`${option.created ? "+" : ""}${option.value}`}
              value={option}
            >
              {option.created ? (
                <span>
                  {createLabel} “{option.label}”
                </span>
              ) : (
                <span className="grid">
                  {option.label}
                  {option.hint ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {option.hint}
                    </span>
                  ) : null}
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
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
