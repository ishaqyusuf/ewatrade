"use client"

import {
  availabilityLabel,
  formatStorefrontPrice,
} from "@ewatrade/storefront-runtime/primitives"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  ToggleGroup,
  ToggleGroupItem,
  useComboboxAnchor,
} from "@ewatrade/ui"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, useState } from "react"

export type ServiceOption = {
  id: string
  name: string
  priceMinor: number | null
  currencyCode: string
  availability: "OUT_OF_STOCK" | "MADE_TO_ORDER" | null
}

/** Below this count options are a visible toggle list; at or above it, a searchable combobox. */
export const SERVICE_OPTION_SEARCH_THRESHOLD = 5
export const SERVICE_PRICE_ON_REQUEST = "Price on request"

export function serviceOptionPriceLabel(option: {
  priceMinor: number | null
  currencyCode: string
}) {
  return option.priceMinor === null
    ? SERVICE_PRICE_ON_REQUEST
    : formatStorefrontPrice(option.priceMinor, option.currencyCode)
}

/** Known IDs only, without repeats, in the catalog's own option order. */
export function orderServiceOptionIds(
  options: readonly ServiceOption[],
  ids: readonly string[],
) {
  return options
    .filter((option) => ids.includes(option.id))
    .map((option) => option.id)
}

/** Out-of-stock options can stay selected (and be removed) but are never newly added. */
export function isServiceOptionSelectable(
  option: ServiceOption,
  value: readonly string[],
) {
  return option.availability !== "OUT_OF_STOCK" || value.includes(option.id)
}

function OptionLabel({ option }: { option: ServiceOption }) {
  const availability = availabilityLabel(option.availability)
  return (
    <>
      <span className="so-name">{option.name}</span>
      <span className="so-meta">
        {availability ? (
          <span className="so-availability">{availability}</span>
        ) : null}
        <span className="so-price">{serviceOptionPriceLabel(option)}</span>
      </span>
    </>
  )
}

/**
 * Multi-select for one service's current public options. Fewer than five options
 * render as a toggle list; five or more as a searchable combobox with removable
 * chips. Only listed option IDs can be chosen; there are no typed custom values.
 */
export function ServiceOptionPicker({
  options,
  value,
  onChange,
  disabled = false,
  label = "Options",
}: {
  options: readonly ServiceOption[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  label?: string
}) {
  const id = useId()
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState("")
  const byId = new Map(options.map((option) => [option.id, option]))
  const change = (next: readonly string[]) =>
    onChange(
      orderServiceOptionIds(
        options,
        next.filter((entry) => {
          const option = byId.get(entry)
          return option ? isServiceOptionSelectable(option, value) : false
        }),
      ),
    )
  if (options.length < SERVICE_OPTION_SEARCH_THRESHOLD)
    return (
      <FieldSet className="so-picker" data-mode="list">
        <FieldLegend variant="label">{label}</FieldLegend>
        <FieldDescription>Choose one or more.</FieldDescription>
        <ToggleGroup
          multiple
          variant="outline"
          orientation="vertical"
          className="so-list"
          aria-label={label}
          disabled={disabled}
          value={value}
          onValueChange={change}
        >
          {options.map((option) => (
            <ToggleGroupItem
              key={option.id}
              value={option.id}
              disabled={disabled || !isServiceOptionSelectable(option, value)}
            >
              <HugeiconsIcon
                icon={Tick02Icon}
                strokeWidth={2}
                className="so-tick"
              />
              <OptionLabel option={option} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>
    )
  return (
    <Field className="so-picker" data-mode="search">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldDescription id={`${id}-hint`}>
        Search and choose one or more of {options.length} options.
      </FieldDescription>
      <Combobox
        multiple
        autoHighlight
        disabled={disabled}
        items={options.map((option) => option.id)}
        itemToStringLabel={(item: string) => byId.get(item)?.name ?? ""}
        value={value}
        onValueChange={(next: string[]) => {
          change(next)
          setQuery("")
        }}
        inputValue={query}
        onInputValueChange={setQuery}
      >
        <ComboboxChips ref={anchor} className="so-chips">
          <ComboboxValue>
            {(ids: string[]) =>
              ids.map((item) => (
                <ComboboxChip
                  key={item}
                  removeLabel={`Remove ${byId.get(item)?.name ?? "option"}`}
                >
                  {byId.get(item)?.name}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput
            id={id}
            placeholder={value.length ? "Add another option" : "Search options"}
            aria-describedby={`${id}-hint`}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No matching options.</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => {
              const option = byId.get(item)
              return option ? (
                <ComboboxItem
                  key={item}
                  value={item}
                  disabled={!isServiceOptionSelectable(option, value)}
                  className="so-row"
                >
                  <OptionLabel option={option} />
                </ComboboxItem>
              ) : null
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}
