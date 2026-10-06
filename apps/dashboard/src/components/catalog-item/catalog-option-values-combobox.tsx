"use client"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  FieldDescription,
  useComboboxAnchor,
} from "@ewatrade/ui"
import { normalizeCatalogSuggestion } from "@ewatrade/utils/business-catalog-guidance"
import { useState } from "react"
import { parseCatalogOptionValues } from "./catalog-option-values"

export function CatalogOptionValuesCombobox({
  id,
  value,
  suggestions,
  placeholder,
  canAdd,
  disabled,
  onChange,
}: {
  id: string
  value: string
  suggestions: string[]
  placeholder: string
  canAdd: boolean
  disabled: boolean
  onChange: (values: string[]) => void
}) {
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState("")
  const selected = parseCatalogOptionValues([value])
  const items = [...selected, ...suggestions].filter(
    (value, index, values) =>
      values.findIndex(
        (candidate) =>
          normalizeCatalogSuggestion(candidate) ===
          normalizeCatalogSuggestion(value),
      ) === index,
  )
  const custom = query.trim()
  const canCreate =
    custom &&
    !items.some(
      (value) =>
        normalizeCatalogSuggestion(value) ===
        normalizeCatalogSuggestion(custom),
    )
  if (canCreate) items.push(custom)

  return (
    <>
      <Combobox
        multiple
        autoHighlight
        disabled={disabled}
        items={items}
        value={selected}
        inputValue={query}
        onInputValueChange={setQuery}
        onValueChange={(values) => {
          onChange(values)
          setQuery("")
        }}
      >
        <ComboboxChips ref={anchor} appearance="form">
          <ComboboxValue>
            {(values: string[]) =>
              values.map((value) => (
                <ComboboxChip key={value} removeLabel={`Remove ${value}`}>
                  {value}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput
            id={id}
            placeholder={placeholder}
            aria-describedby={`${id}-hint`}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No matching values.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxGroup>
              <ComboboxCollection>
                {(item: string) => (
                  <ComboboxItem
                    key={item}
                    value={item}
                    disabled={!canAdd && !selected.includes(item)}
                  >
                    {canCreate && item === custom ? `Add “${item}”` : item}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription id={`${id}-hint`}>
        {canAdd
          ? "Select values or type your own and choose Add. You can select more than one."
          : "Choice limit reached. Remove a value before adding another."}
      </FieldDescription>
    </>
  )
}
