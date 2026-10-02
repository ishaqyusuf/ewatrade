import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import {
  CATALOG_CATEGORY_PRESETS,
  type CatalogCategoryPreset,
  getCatalogCategoryPresets,
} from "@ewatrade/utils/catalog-category-presets"
import { useQuery } from "@tanstack/react-query"
import {
  catalogCategoryEmoji,
  catalogCategoryLabelEmoji,
} from "@ewatrade/utils/catalog-category-emojis"
import { useState } from "react"
import { View } from "react-native"
import { CatalogDetailRow } from "./catalog-setup-details"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogCategoryEditor({
  model,
  onSelectParent,
  onAppliedSuggestion,
}: {
  model: CatalogSetupModel
  onSelectParent: (category: CatalogCategoryPreset) => void
  onAppliedSuggestion: () => void
}) {
  const [query, setQuery] = useState("")
  const [all, setAll] = useState(false)
  const trpc = useTRPC()
  const history = useQuery(
    trpc.catalog.listItemsPage.queryOptions(
      {
        kind: model.kind ?? undefined,
        limit: 50,
        sort: { field: "updatedAt", direction: "desc" },
      },
      {
        enabled: model.canManage && !model.isOffline && !model.scopeChanged,
        retry: false,
      },
    ),
  )
  const saved = useQuery(
    trpc.catalog.categories.list.queryOptions(undefined, {
      enabled: model.canManage && !model.isOffline && !model.scopeChanged,
      retry: false,
    }),
  )
  const recent = [
    ...new Set([
      ...(saved.data ?? []).flatMap((root) => [
        root.label,
        ...root.children.map((child) => `${root.label} / ${child.label}`),
      ]),
      ...(history.data?.items ?? [])
        .map((item) => item.category)
        .filter((category): category is string => Boolean(category)),
    ]),
  ].filter((category) =>
    category.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const presets = getCatalogCategoryPresets({
    kind: model.kind ?? "product",
    businessProfileKey: model.businessProfileKey,
    query,
    all: all || Boolean(query.trim()),
  })
  return (
    <>
      <Text className="text-sm text-muted-foreground">
        Category is optional. Keep this item Uncategorized, reuse a recent
        category, or choose a suggestion.
      </Text>
      {model.categorySuggestions.length ? (
        <View className="mt-3 rounded-2xl border border-border bg-card px-4">
          <Text
            accessibilityRole="header"
            className="pt-4 text-xs font-bold tracking-widest text-muted-foreground"
          >
            SUGGESTIONS
          </Text>
          {model.categorySuggestions.map((suggestion, index) => (
            <CatalogDetailRow
              key={suggestion.key}
              label={suggestion.childLabel ?? suggestion.rootLabel}
              description={`${index === 0 ? "Best match · " : ""}${suggestion.category}`}
              icon="FolderPlus"
              emoji={suggestion.emoji}
              disabled={model.locked}
              onPress={() => {
                if (model.applyCategorySuggestion(suggestion))
                  onAppliedSuggestion()
              }}
            />
          ))}
        </View>
      ) : null}
      <CatalogDetailRow
        label="Uncategorized"
        emoji="🏷️"
        description="No category selected"
        icon="FolderPlus"
        onPress={() => model.setCategory("")}
      />
      <FormField
        label="Search categories"
        placeholder="Search all categories and subcategories"
        value={query}
        onChangeText={setQuery}
      />
      {history.isError || saved.isError ? (
        <StatusBanner
          tone="warning"
          message="Recent categories could not load. Suggestions are still available."
          actionLabel={model.isOffline ? undefined : "Try again"}
          onActionPress={() => {
            void history.refetch()
            void saved.refetch()
          }}
        />
      ) : null}
      {recent.length ? (
        <View>
          <Text className="font-bold text-foreground">
            Previously used in this business
          </Text>
          <Text className="text-xs text-muted-foreground">
            Saved categories and labels from recent items.
          </Text>
          {recent.map((category) => (
            <CatalogDetailRow
              key={category}
              label={category}
              emoji={catalogCategoryLabelEmoji(category)}
              description={
                model.category === category ? "Selected" : "Use this category"
              }
              icon="FolderPlus"
              onPress={() => {
                model.setCategory(category)
                const parent = CATALOG_CATEGORY_PRESETS.find(
                  (preset) =>
                    preset.label.toLowerCase() === category.toLowerCase(),
                )
                if (parent) onSelectParent(parent)
              }}
            />
          ))}
        </View>
      ) : null}
      <View>
        <Text className="font-bold text-foreground">
          {all || query.trim()
            ? "All categories"
            : "Suggested for your business"}
        </Text>
        {presets.map((category) => (
          <CatalogDetailRow
            key={category.key}
            label={category.label}
            emoji={catalogCategoryEmoji(category.key)}
            description={`${category.subcategories.length} optional subcategories`}
            icon="FolderPlus"
            onPress={() => onSelectParent(category)}
          />
        ))}
      </View>
      {!all ? (
        <ActionButton variant="outline" onPress={() => setAll(true)}>
          Browse all categories
        </ActionButton>
      ) : null}
      <FormField
        label="Selected category or your own (optional)"
        helper="Use a name that will help customers browse your catalog."
        maxLength={120}
        value={model.category}
        onChangeText={model.setCategory}
      />
    </>
  )
}

export function CatalogSubcategoryEditor({
  category,
  model,
}: { category: CatalogCategoryPreset; model: CatalogSetupModel }) {
  const [custom, setCustom] = useState("")
  const label = custom.trim()
    ? `${category.label} / ${custom.trim()}`
    : category.label
  return (
    <>
      <Text className="text-sm text-muted-foreground">
        Choose {category.label} alone, or refine the category. A subcategory is
        optional.
      </Text>
      <CatalogDetailRow
        label={category.label}
        emoji={catalogCategoryEmoji(category.key)}
        description="Use category without a subcategory"
        icon="FolderPlus"
        onPress={() => model.setCategory(category.label)}
      />
      {category.subcategories.map((child) => {
        const value = `${category.label} / ${child.label}`
        return (
          <CatalogDetailRow
            key={child.key}
            label={child.label}
            emoji={catalogCategoryEmoji(child.key)}
            description={
              model.category === value ? "Selected" : `Under ${category.label}`
            }
            icon="FolderPlus"
            onPress={() => model.setCategory(value)}
          />
        )
      })}
      <FormField
        label="Other subcategory (optional)"
        maxLength={Math.max(0, 117 - category.label.length)}
        value={custom}
        onChangeText={setCustom}
      />
      <ActionButton variant="outline" onPress={() => model.setCategory(label)}>
        Use {custom.trim() ? "this subcategory" : category.label}
      </ActionButton>
      <Text className="text-sm text-muted-foreground">
        Selected: {model.category || "Uncategorized"}
      </Text>
    </>
  )
}
