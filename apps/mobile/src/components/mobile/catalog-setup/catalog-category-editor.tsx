import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/client"
import {
  catalogCategoryEmoji,
  catalogCategoryLabelEmoji,
} from "@ewatrade/utils/catalog-category-emojis"
import {
  CATALOG_CATEGORY_PRESETS,
  type CatalogCategoryPreset,
  getCatalogCategoryPresets,
} from "@ewatrade/utils/catalog-category-presets"
import { rankBySearch } from "@ewatrade/utils/search-rank"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Text as NativeText, View } from "react-native"
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

const shown = (category: string) => category.split(" / ").join(" › ")

/**
 * Category (01 Live Card, owner revision 9 Oct 2026): the selected category
 * first, best matches from the name, suggestions with their subcategories as
 * chips, your own name, and deep search from the footer (`query`).
 */
export function ClassicCategoryEditor({
  model,
  query,
}: {
  model: CatalogSetupModel
  query: string
}) {
  const [all, setAll] = useState(false)
  const [own, setOwn] = useState("")
  const trpc = useTRPC()
  const enabled = model.canManage && !model.isOffline && !model.scopeChanged
  const history = useQuery(
    trpc.catalog.listItemsPage.queryOptions(
      {
        kind: model.kind ?? undefined,
        limit: 50,
        sort: { field: "updatedAt", direction: "desc" },
      },
      { enabled, retry: false },
    ),
  )
  const saved = useQuery(
    trpc.catalog.categories.list.queryOptions(undefined, {
      enabled,
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
  ].slice(0, 8)
  const presets = getCatalogCategoryPresets({
    kind: model.kind ?? "product",
    businessProfileKey: model.businessProfileKey,
    all,
  })
  const searching = Boolean(query.trim())
  const results = searching
    ? rankBySearch(
        [
          ...new Set([
            ...recent,
            ...CATALOG_CATEGORY_PRESETS.flatMap((preset) => [
              preset.label,
              ...preset.subcategories.map(
                (child) => `${preset.label} / ${child.label}`,
              ),
            ]),
          ]),
        ],
        query,
        (category) => {
          const [root, child] = category.split(" / ")
          return child
            ? [{ text: child }, { text: root, weight: 0.8 }]
            : [{ text: root }]
        },
      ).slice(0, 20)
    : []
  const use = (category: string) => model.setCategory(category)
  return (
    <View className="gap-1">
      <SelectedCategoryCard
        category={model.category}
        onRemove={() => model.setCategory("")}
      />
      {searching ? (
        <>
          <SectionTitle title="Results" trailing={String(results.length)} />
          <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
            {results.map((category, index) => (
              <CategoryChoiceRow
                key={category}
                border={index > 0}
                category={category}
                selected={model.category === category}
                onUse={() => use(category)}
              />
            ))}
            {!results.length ? (
              <Text className="py-4 text-[13px] text-muted-foreground">
                No category matches. Use “{query.trim()}” as your own below.
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <>
          {model.categorySuggestions.length ? (
            <>
              <SectionTitle
                title={`Best match for “${model.name.trim() || "this item"}”`}
              />
              <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
                {model.categorySuggestions.map((suggestion, index) => (
                  <CategoryChoiceRow
                    key={suggestion.key}
                    border={index > 0}
                    category={suggestion.category}
                    emoji={suggestion.emoji}
                    note={index === 0 ? "Best match" : "Also fits"}
                    selected={model.category === suggestion.category}
                    tint
                    onUse={() => {
                      if (!model.applyCategorySuggestion(suggestion))
                        use(suggestion.category)
                    }}
                  />
                ))}
              </View>
            </>
          ) : null}
          {recent.length ? (
            <>
              <SectionTitle title="Used in this business" />
              <View className="flex-row flex-wrap gap-2">
                {recent.map((category) => (
                  <CategoryChip
                    key={category}
                    label={shown(category)}
                    selected={model.category === category}
                    onPress={() => use(category)}
                  />
                ))}
              </View>
            </>
          ) : null}
          <SectionTitle
            title={all ? "All categories" : "Suggested for your business"}
          />
          <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
            {presets.map((preset, index) => (
              <View
                key={preset.key}
                className={cn("py-3", index > 0 && "border-t border-border")}
              >
                <Pressable
                  accessibilityLabel={preset.label}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: model.category === preset.label,
                  }}
                  className="min-h-11 flex-row items-center gap-2.5"
                  haptic
                  onPress={() => use(preset.label)}
                >
                  <View className="size-9 items-center justify-center rounded-[11px] bg-muted">
                    <Text accessible={false} className="text-lg">
                      {catalogCategoryEmoji(preset.key)}
                    </Text>
                  </View>
                  <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
                    {preset.label}
                  </Text>
                  {model.category === preset.label ? (
                    <Icon className="size-[18px] text-primary" name="Check" />
                  ) : (
                    <Text className="text-xs text-muted-foreground">
                      {preset.subcategories.length} sub
                    </Text>
                  )}
                </Pressable>
                <View className="mt-2 ml-[46px] flex-row flex-wrap gap-1.5">
                  {preset.subcategories.map((child) => {
                    const value = `${preset.label} / ${child.label}`
                    return (
                      <CategoryChip
                        key={child.key}
                        label={child.label}
                        selected={model.category === value}
                        onPress={() => use(value)}
                      />
                    )
                  })}
                </View>
              </View>
            ))}
          </View>
          {!all ? (
            <Pressable
              accessibilityRole="button"
              className="mt-3 min-h-11 items-center justify-center rounded-[14px] bg-card shadow-sm active:bg-accent"
              haptic
              onPress={() => setAll(true)}
            >
              <Text className="text-sm font-bold text-foreground">
                Browse all categories
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
      <SectionTitle title="Your own" trailing="Optional" />
      <View className="gap-2 rounded-[20px] bg-card p-3.5 shadow-sm">
        <View className="flex-row items-end gap-2">
          <View className="min-w-0 flex-1">
            <FormField
              label="Category name"
              maxLength={120}
              placeholder={searching ? query.trim() : "e.g. Organic eggs"}
              value={own}
              onChangeText={setOwn}
              variant="green-gate"
            />
          </View>
          <Pressable
            accessibilityLabel="Use your own category"
            accessibilityRole="button"
            className="min-h-[50px] justify-center rounded-[14px] bg-accent px-4"
            disabled={!(own.trim() || query.trim())}
            haptic
            onPress={() => use((own.trim() || query.trim()).slice(0, 120))}
          >
            <Text className="text-[13px] font-extrabold text-accent-foreground">
              Use
            </Text>
          </Pressable>
        </View>
        <Text className="text-xs text-muted-foreground">
          Use a name that helps customers browse your catalog.
        </Text>
      </View>
    </View>
  )
}

function SectionTitle({
  title,
  trailing,
}: { title: string; trailing?: string }) {
  return (
    <View className="mt-[18px] mb-2 flex-row items-baseline justify-between gap-3">
      <Text className="min-w-0 flex-1 text-base font-extrabold text-foreground">
        {title}
      </Text>
      {trailing ? (
        <Text className="text-[13px] font-bold text-muted-foreground">
          {trailing}
        </Text>
      ) : null}
    </View>
  )
}

function SelectedCategoryCard({
  category,
  onRemove,
}: {
  category: string
  onRemove: () => void
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const colors = useColors()
  return (
    <View
      accessibilityLabel={`Selected category: ${category ? shown(category) : "Uncategorized"}`}
      style={{
        alignItems: "center",
        backgroundColor: category ? palette.mint : colors.card,
        borderRadius: 18,
        flexDirection: "row",
        gap: 12,
        padding: 14,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: category ? colors.card : colors.muted,
          borderRadius: 13,
          height: 42,
          justifyContent: "center",
          width: 42,
        }}
      >
        <Text accessible={false} className="text-[22px]">
          {category ? catalogCategoryLabelEmoji(category) : "🏷️"}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <NativeText
          style={{
            color: category ? palette.mintForeground : colors.mutedForeground,
            fontSize: 11.5,
            fontWeight: "800",
            letterSpacing: 0.5,
          }}
        >
          SELECTED
        </NativeText>
        <Text className="text-[15.5px] font-bold text-foreground">
          {category ? shown(category) : "Uncategorized"}
        </Text>
      </View>
      {category ? (
        <Pressable
          accessibilityLabel="Remove category"
          accessibilityRole="button"
          className="min-h-11 justify-center px-1"
          haptic
          onPress={onRemove}
        >
          <Text className="text-[13px] font-extrabold text-primary">
            Remove
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function CategoryChoiceRow({
  border,
  category,
  emoji,
  note,
  selected,
  tint = false,
  onUse,
}: {
  border: boolean
  category: string
  emoji?: string
  note?: string
  selected: boolean
  tint?: boolean
  onUse: () => void
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const colors = useColors()
  const [root, child] = category.split(" / ")
  return (
    <View
      className={cn(
        "min-h-[58px] flex-row items-center gap-2.5 py-2.5",
        border && "border-t border-border",
      )}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: tint ? palette.lilac : colors.muted,
          borderRadius: 11,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Text accessible={false} className="text-lg">
          {emoji ?? catalogCategoryLabelEmoji(category)}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-foreground">
          {child ? shown(category) : root}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {note ?? (child ? `Under ${root}` : "Category")}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={
          selected ? `${shown(category)} selected` : `Use ${shown(category)}`
        }
        accessibilityRole="button"
        haptic
        onPress={onUse}
        style={{
          backgroundColor: selected ? colors.primary : colors.accent,
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <NativeText
          style={{
            color: selected
              ? colors.primaryForeground
              : colors.accentForeground,
            fontSize: 12.5,
            fontWeight: "800",
          }}
        >
          {selected ? "Selected" : "Use"}
        </NativeText>
      </Pressable>
    </View>
  )
}

function CategoryChip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={cn(
        "min-h-9 flex-row items-center gap-1 rounded-full border-[1.5px] px-3",
        selected
          ? "border-primary/40 bg-accent"
          : "border-transparent bg-muted",
      )}
      haptic
      onPress={onPress}
    >
      {selected ? (
        <Icon className="size-[13px] text-primary" name="Check" />
      ) : null}
      <Text
        className={cn(
          "text-[12.5px] font-bold",
          selected ? "text-accent-foreground" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
