"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
} from "@ewatrade/ui"

import { useTRPC } from "@/trpc/client"

import {
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
  const [error, setError] = useState<string | null>(null)
  const suggestions = useQuery(
    trpc.inventory.categorySuggestions.queryOptions(
      { query: input.slice(0, 80) },
      { enabled: !disabled },
    ),
  )
  function add(category?: StockCategoryDraft) {
    try {
      onChange(
        collectStockCategoryDraft(
          category ? [...value, category] : value,
          category ? "" : input,
        ),
      )
      onInputChange("")
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Invalid category.")
    }
  }
  function change(text: string) {
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
  const available =
    suggestions.data?.filter(
      (category) =>
        !value.some(
          (selected) =>
            normalizeStockCategoryName(selected.name).normalizedName ===
            normalizeStockCategoryName(category.name).normalizedName,
        ),
    ) ?? []
  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>Categories</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {value.map((category, index) => (
          <button
            type="button"
            key={category.name}
            disabled={disabled}
            aria-label={`Remove ${category.name}`}
            onClick={() =>
              onChange(value.filter((_, position) => position !== index))
            }
            className="rounded-full border border-border bg-muted px-3 py-1 text-sm"
          >
            {category.name} <span aria-hidden>×</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          value={input}
          disabled={disabled}
          maxLength={810}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              add()
            }
          }}
          aria-describedby={`${id}-help`}
          placeholder="Egg collection, Row 1, Morning collection"
        />
        <Button
          appearance="form"
          type="button"
          variant="outline"
          disabled={disabled || !input.trim()}
          onClick={() => add()}
        >
          Add
        </Button>
      </div>
      <FieldDescription id={`${id}-help`}>
        Choose a saved category or type a new one. Use commas or Enter to add up
        to 10.
      </FieldDescription>
      {available.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Saved categories">
          {available.map((category) => (
            <button
              type="button"
              disabled={disabled}
              key={category.id}
              className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
              onClick={() =>
                add({ categoryNameId: category.id, name: category.name })
              }
            >
              {category.name}
            </button>
          ))}
        </div>
      ) : null}
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
