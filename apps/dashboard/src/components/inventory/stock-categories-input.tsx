"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  Field,
  FieldDescription,
  FieldLabel,
  useComboboxAnchor,
} from "@ewatrade/ui"
import {
  MAX_STOCK_CATEGORIES,
  type StockCategoryDraft,
  collectStockCategoryDraft,
  normalizeStockCategoryName,
} from "@ewatrade/utils/inventory-categories"
import { useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"

export function StockCategoriesInput({
  value,
  input,
  onChange,
  onInputChange,
  disabled = false,
}: {
  value: StockCategoryDraft[]
  input: string
  onChange: (value: StockCategoryDraft[]) => void
  onInputChange: (value: string) => void
  disabled?: boolean
}) {
  const trpc = useTRPC()
  const id = useId()
  const anchor = useComboboxAnchor()
  const [error, setError] = useState<string | null>(null)
  const suggestions = useQuery(
    trpc.inventory.categorySuggestions.queryOptions(
      { query: input.slice(0, 80) },
      { enabled: !disabled },
    ),
  )
  const categories = new Map<string, StockCategoryDraft>()
  for (const category of suggestions.data ?? []) {
    categories.set(normalizeStockCategoryName(category.name).normalizedName, {
      categoryNameId: category.id,
      name: category.name,
    })
  }
  for (const category of value) {
    categories.set(
      normalizeStockCategoryName(category.name).normalizedName,
      category,
    )
  }
  let custom: string | null = null
  try {
    if (input.trim() && !input.includes(",")) {
      const normalized = normalizeStockCategoryName(input)
      if (!categories.has(normalized.normalizedName)) {
        custom = normalized.name
        categories.set(normalized.normalizedName, { name: custom })
      }
    }
  } catch {
    // Selecting a name presents validation errors without interrupting typing.
  }
  const items = [...categories.values()].map((category) => category.name)
  const selected = value.map((category) => category.name)
  const atLimit = value.length >= MAX_STOCK_CATEGORIES

  function add() {
    if (disabled) return
    try {
      onChange(
        collectStockCategoryDraft(value, input).map(
          (category) =>
            categories.get(
              normalizeStockCategoryName(category.name).normalizedName,
            ) ?? category,
        ),
      )
      onInputChange("")
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Invalid category.")
    }
  }
  function change(text: string) {
    if (disabled) return
    if (!text.includes(",")) {
      onInputChange(text)
      setError(null)
      return
    }
    const lastComma = text.lastIndexOf(",")
    try {
      onChange(collectStockCategoryDraft(value, text.slice(0, lastComma)))
      onInputChange(text.slice(lastComma + 1))
      setError(null)
    } catch (failure) {
      onInputChange(text)
      setError(failure instanceof Error ? failure.message : "Invalid category.")
    }
  }

  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>Categories</FieldLabel>
      <div className="flex items-start gap-2">
        <Combobox
          multiple
          autoHighlight
          disabled={disabled}
          items={items}
          value={selected}
          inputValue={input}
          onInputValueChange={change}
          onValueChange={(names) => {
            if (disabled) return
            try {
              const next = names.map(
                (name) =>
                  categories.get(
                    normalizeStockCategoryName(name).normalizedName,
                  ) ?? { name },
              )
              onChange(next.length ? collectStockCategoryDraft(next) : [])
              onInputChange("")
              setError(null)
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Invalid category.",
              )
            }
          }}
        >
          <ComboboxChips
            ref={anchor}
            appearance="form"
            className="min-h-10 flex-1"
          >
            <ComboboxValue>
              {(names: string[]) =>
                names.map((name) => (
                  <ComboboxChip key={name} removeLabel={`Remove ${name}`}>
                    {name}
                  </ComboboxChip>
                ))
              }
            </ComboboxValue>
            <ComboboxChipsInput
              id={id}
              className="min-w-40"
              maxLength={810}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  input.trim() &&
                  !event.currentTarget.getAttribute("aria-activedescendant")
                ) {
                  event.preventDefault()
                  add()
                }
              }}
              aria-describedby={`${id}-help`}
              aria-invalid={Boolean(error)}
              placeholder={
                value.length
                  ? "Add another category"
                  : "Select or type a category"
              }
            />
            <ComboboxTrigger
              aria-label="Show saved categories"
              disabled={disabled}
            />
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            {!input.trim() && Boolean(suggestions.data?.length) ? (
              <p className="px-3 pt-3 pb-1 text-xs text-muted-foreground">
                Start typing to add a new category.
              </p>
            ) : null}
            {suggestions.isPending || input.trim() ? (
              <ComboboxEmpty>
                {suggestions.isPending
                  ? "Loading categories…"
                  : "Type a valid category name to add it."}
              </ComboboxEmpty>
            ) : null}
            <ComboboxList>
              <ComboboxCollection>
                {(name: string) => (
                  <ComboboxItem
                    key={name}
                    value={name}
                    disabled={atLimit && !selected.includes(name)}
                  >
                    {name === custom ? `Add “${name}”` : name}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      <FieldDescription id={`${id}-help`}>
        {atLimit
          ? "10 categories selected. Remove one to add another."
          : "Select multiple categories, or type a new name and press Enter. Commas also add names."}{" "}
        Categories from saved activities become available next time.
      </FieldDescription>
      {suggestions.isError ? (
        <p className="text-xs text-muted-foreground">
          Saved categories could not load. You can still enter a name.
        </p>
      ) : null}
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
    </Field>
  )
}
