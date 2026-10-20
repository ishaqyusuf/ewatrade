"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import {
  Button,
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
  label = "Reason",
  presets = [],
}: {
  value: StockCategoryDraft[]
  input: string
  onChange: (value: StockCategoryDraft[]) => void
  onInputChange: (value: string) => void
  disabled?: boolean
  /** The question this field answers, e.g. "What happened?". */
  label?: string
  /** Ready-made reasons shown as one-tap chips. */
  presets?: readonly string[]
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
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {presets.length ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((name) => {
            const key = normalizeStockCategoryName(name).normalizedName
            const on = value.some(
              (category) =>
                normalizeStockCategoryName(category.name).normalizedName ===
                key,
            )
            return (
              <Button
                key={name}
                type="button"
                size="sm"
                variant={on ? "secondary" : "outline"}
                className="rounded-full"
                aria-pressed={on}
                disabled={disabled || (!on && atLimit)}
                onClick={() => {
                  onChange(
                    on
                      ? value.filter(
                          (category) =>
                            normalizeStockCategoryName(category.name)
                              .normalizedName !== key,
                        )
                      : [...value, categories.get(key) ?? { name }],
                  )
                  setError(null)
                }}
              >
                {name}
              </Button>
            )
          })}
        </div>
      ) : null}
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
                value.length || presets.length
                  ? "Type your own"
                  : "Type a reason"
              }
            />
            <ComboboxTrigger
              aria-label="Show reasons you used before"
              disabled={disabled}
            />
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            {!input.trim() && Boolean(suggestions.data?.length) ? (
              <p className="px-3 pt-3 pb-1 text-xs text-muted-foreground">
                Or type a new reason.
              </p>
            ) : null}
            {suggestions.isPending || input.trim() ? (
              <ComboboxEmpty>
                {suggestions.isPending
                  ? "Loading reasons…"
                  : "Type a reason to add it."}
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
          ? "10 reasons picked. Remove one to add another."
          : "Pick one or more, or type your own and press Enter."}{" "}
        Reasons you use are remembered.
      </FieldDescription>
      {suggestions.isError ? (
        <p className="text-xs text-muted-foreground">
          Reasons you used before couldn’t load. You can still type one.
        </p>
      ) : null}
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
    </Field>
  )
}
