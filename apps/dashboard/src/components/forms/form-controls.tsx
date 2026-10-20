"use client"

import {
  Autocomplete,
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
  RadioGroup,
  RadioGroupItem,
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

/** Searchable pick from a fixed list (shadcn Combobox). */
export function FormCombobox<T extends FieldValues>({
  control,
  name,
  options,
  placeholder,
  empty = "No results.",
  id,
}: StringField<T> & {
  options: ComboOption[]
  placeholder?: string
  empty?: string
  id?: string
}) {
  const { field, fieldState } = useController({ control, name })
  const value = typeof field.value === "string" ? field.value : ""
  return (
    <Combobox<ComboOption>
      items={options}
      value={options.find((option) => option.value === value) ?? null}
      itemToStringLabel={(option) => option.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      autoHighlight
      onValueChange={(option) => field.onChange(option?.value ?? "")}
    >
      <ComboboxInput
        id={id}
        ref={field.ref}
        placeholder={placeholder}
        aria-invalid={fieldState.invalid}
        onBlur={field.onBlur}
        className="w-full rounded-none border-border bg-transparent"
      />
      <ComboboxContent className={POPUP}>
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList>
          {(option: ComboOption) => (
            <ComboboxItem key={option.value} value={option}>
              <OptionText option={option} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/**
 * Free text with suggestions (Base UI Autocomplete): pick a listed name or keep
 * typing a new one. The field stores the text.
 */
export function FormAutocomplete<T extends FieldValues>({
  control,
  name,
  options,
  placeholder,
  id,
}: StringField<T> & {
  options: ComboOption[]
  placeholder?: string
  id?: string
}) {
  const { field, fieldState } = useController({ control, name })
  return (
    <Autocomplete.Root
      items={options}
      value={typeof field.value === "string" ? field.value : ""}
      onValueChange={(value) => field.onChange(value)}
      itemToStringValue={(option: ComboOption) => option.label}
    >
      <Autocomplete.Input
        id={id}
        ref={field.ref}
        placeholder={placeholder}
        aria-invalid={fieldState.invalid}
        onBlur={field.onBlur}
        autoComplete="off"
        className={INPUT}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner
          sideOffset={6}
          align="start"
          className="isolate z-50"
        >
          <Autocomplete.Popup
            className={`${POPUP} w-(--anchor-width) max-h-72 overflow-y-auto p-1 text-sm text-popover-foreground data-empty:hidden`}
          >
            <Autocomplete.List>
              {(option: ComboOption) => (
                <Autocomplete.Item
                  key={option.value}
                  value={option}
                  className="flex cursor-default items-center px-3 py-2 outline-hidden select-none data-highlighted:bg-accent"
                >
                  <OptionText option={option} />
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  )
}

const POPUP =
  "rounded-none border border-border bg-popover shadow-md ring-0 before:hidden **:data-[slot$=-item]:rounded-none"
const INPUT =
  "h-9 w-full min-w-0 border border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring aria-invalid:border-destructive"

function OptionText({ option }: { option: ComboOption }) {
  return (
    <span className="grid">
      {option.label}
      {option.hint ? (
        <span className="text-xs font-normal text-muted-foreground">
          {option.hint}
        </span>
      ) : null}
    </span>
  )
}

/** shadcn RadioGroup as bordered choices, one per row or wrapped inline. */
export function FormRadioChoices<T extends FieldValues>({
  control,
  name,
  options,
  inline,
  label,
}: StringField<T> & {
  options: { value: string; label: string; hint?: string }[]
  inline?: boolean
  label: string
}) {
  const { field } = useController({ control, name })
  return (
    <RadioGroup
      aria-label={label}
      value={typeof field.value === "string" ? field.value : ""}
      onValueChange={(value) => field.onChange(value as string)}
      className={inline ? "flex flex-wrap gap-2" : undefined}
    >
      {options.map((option) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: the radio is the label's child
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-2.5 border border-border px-3 py-2 text-sm has-data-checked:border-foreground"
        >
          <RadioGroupItem value={option.value} className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="font-medium">{option.label}</span>
            {option.hint ? (
              <span className="text-xs text-muted-foreground">
                {option.hint}
              </span>
            ) : null}
          </span>
        </label>
      ))}
    </RadioGroup>
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
