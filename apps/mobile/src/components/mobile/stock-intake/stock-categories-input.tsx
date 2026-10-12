import { FormField } from "@/components/mobile/form-field"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import {
  type StockCategoryDraft,
  collectStockCategoryDraft,
  normalizeStockCategoryName,
} from "@ewatrade/utils/inventory-categories"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

export function StockCategoriesInput({
  value,
  input,
  onChange,
  onInputChange,
  disabled,
}: {
  value: StockCategoryDraft[]
  input: string
  onChange: (value: StockCategoryDraft[]) => void
  onInputChange: (value: string) => void
  disabled: boolean
}) {
  const trpc = useTRPC()
  const [error, setError] = useState<string | undefined>()
  const suggestions = useQuery(
    trpc.inventory.categorySuggestions.queryOptions(
      { query: input.slice(0, 80) },
      { enabled: !disabled },
    ),
  )
  function add(category?: StockCategoryDraft) {
    if (disabled) return
    try {
      onChange(
        collectStockCategoryDraft(
          category ? [...value, category] : value,
          category ? "" : input,
        ),
      )
      onInputChange("")
      setError(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Invalid category.")
    }
  }
  function change(text: string) {
    if (!text.includes(",")) {
      onInputChange(text)
      setError(undefined)
      return
    }
    const lastComma = text.lastIndexOf(",")
    try {
      onChange(collectStockCategoryDraft(value, text.slice(0, lastComma)))
      onInputChange(text.slice(lastComma + 1))
      setError(undefined)
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
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {value.map((category, index) => (
          <Pressable
            key={category.name}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${category.name}`}
            disabled={disabled}
            className="min-h-11 justify-center rounded-full border border-border bg-muted px-3"
            onPress={() =>
              onChange(value.filter((_, position) => position !== index))
            }
          >
            <Text className="text-sm text-foreground">{category.name} ×</Text>
          </Pressable>
        ))}
      </View>
      <FormField
        label="Categories"
        value={input}
        editable={!disabled}
        maxLength={810}
        variant="filled"
        placeholder="Egg collection, Row 1, Morning collection"
        onChangeText={change}
        onSubmitEditing={() => add()}
        actionLabel={!disabled && input.trim() ? "Add" : undefined}
        onActionPress={() => add()}
        error={error}
        helper="Choose a saved category or type a new one. Use commas or Add; up to 10 categories."
      />
      <View className="flex-row flex-wrap gap-2">
        {available.map((category) => (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={`Select ${category.name}`}
            disabled={disabled}
            className="min-h-11 justify-center rounded-full border border-border bg-muted px-3"
            onPress={() =>
              add({ categoryNameId: category.id, name: category.name })
            }
          >
            <Text className="text-sm text-foreground">{category.name}</Text>
          </Pressable>
        ))}
      </View>
      {suggestions.isError ? (
        <Text className="text-xs text-muted-foreground">
          Saved categories could not load. You can still enter a name.
        </Text>
      ) : null}
    </View>
  )
}
