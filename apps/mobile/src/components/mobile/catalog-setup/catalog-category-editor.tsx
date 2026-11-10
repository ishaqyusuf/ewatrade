import { SearchFold } from "@/components/mobile/search-fold"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { View } from "react-native"
import type { CatalogSetupModel } from "./use-catalog-setup"

/** Search remains owned by the form's existing floating search footer. */
export function ClassicCategoryEditor({
  model,
  query,
  searchFocused = false,
}: {
  model: CatalogSetupModel
  query: string
  searchFocused?: boolean
}) {
  const trpc = useTRPC()
  const [parentId, setParentId] = useState<string>()
  const [after, setAfter] = useState<string>()
  const search = useDebounce(query.trim(), 250)
  const searching = Boolean(query.trim())
  const settled = search === query.trim()
  const enabled = model.canManage && !model.isOffline && !model.scopeChanged
  const tree = useQuery(
    trpc.catalog.categories.browse.queryOptions(
      { parentId, after },
      {
        enabled: enabled && !searching,
        staleTime: 300_000,
        retry: false,
      },
    ),
  )
  const matches = useQuery(
    trpc.catalog.searchProductCategories.queryOptions(
      { query: search || " " },
      {
        enabled: enabled && searching && settled,
        staleTime: 300_000,
        retry: false,
      },
    ),
  )
  const request = searching ? matches : tree
  const rows = searching
    ? settled
      ? (matches.data ?? [])
      : []
    : (tree.data?.categories ?? [])
  const loading = request.isFetching || (searching && !settled)
  function browse(key?: string) {
    setParentId(key)
    setAfter(undefined)
  }
  // The name's suggestions lead the picker, best match first.
  const suggestions = model.kind === "product" ? model.categorySuggestions : []
  return (
    <View className="gap-3">
      {suggestions.length > 0 && !searching ? (
        <View className="rounded-[18px] bg-card px-3.5">
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.key}
              accessibilityRole="radio"
              accessibilityLabel={`Use ${index === 0 ? "best match " : ""}${suggestion.category}`}
              accessibilityState={{
                selected: model.category === suggestion.category,
                disabled: !enabled,
              }}
              disabled={!enabled}
              className={cn(
                "min-h-[58px] flex-row items-center gap-2 py-2",
                index > 0 && "border-t border-border",
              )}
              onPress={() => {
                if (!model.applyCategorySuggestion(suggestion))
                  model.setCategory(suggestion.category)
              }}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-bold text-primary">
                  {index === 0 ? "Best match" : "Also suggested"}
                </Text>
                <Text className="text-sm font-bold text-foreground">
                  {suggestion.category.split(" / ").join(" › ")}
                </Text>
              </View>
              {model.category === suggestion.category ? (
                <Icon name="Check" className="size-4 text-primary" />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <SearchFold folded={searchFocused || searching}>
        <View className="gap-2 rounded-[18px] bg-card p-3.5">
          <Text className="text-base font-bold text-foreground">
            Selected category
          </Text>
          <Text className="text-sm text-foreground">
            {model.category || "Uncategorized"}
          </Text>
          {model.category ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-11 justify-center"
              onPress={() => model.setCategory("")}
            >
              <Text className="font-bold text-primary">Clear category</Text>
            </Pressable>
          ) : null}
        </View>
      </SearchFold>
      {!searching ? (
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center px-2"
            onPress={() => browse()}
          >
            <Text className="font-bold text-primary">All categories</Text>
          </Pressable>
          {tree.data?.breadcrumbs.map((entry) => (
            <Pressable
              key={entry.categoryKey}
              accessibilityRole="button"
              className="min-h-11 justify-center px-2"
              onPress={() => browse(entry.categoryKey)}
            >
              <Text className="text-primary">{entry.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {loading ? (
        <Text
          accessibilityRole="alert"
          className="text-sm text-muted-foreground"
        >
          Loading categories…
        </Text>
      ) : null}
      {request.isError ? (
        <View className="gap-2">
          <Text className="text-sm text-muted-foreground">
            Categories could not load. Your selection is unchanged.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center"
            onPress={() => void request.refetch()}
          >
            <Text className="font-bold text-primary">Try again</Text>
          </Pressable>
        </View>
      ) : null}
      <View className="rounded-[18px] bg-card px-3.5">
        {rows.map((entry) => (
          <View
            key={entry.categoryKey}
            className="min-h-[58px] flex-row items-center gap-2 border-b border-border py-2"
          >
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={`Use ${entry.label}`}
              accessibilityState={{
                selected: model.category === entry.label,
                disabled: !enabled || loading,
              }}
              disabled={!enabled || loading}
              className="min-h-11 flex-1 flex-row items-center gap-2"
              onPress={() => model.setCategory(entry.label)}
            >
              <Text className="flex-1 text-sm font-bold text-foreground">
                {searching ? entry.label.split(" / ").join(" › ") : entry.name}
              </Text>
              {model.category === entry.label ? (
                <Icon name="Check" className="size-4 text-primary" />
              ) : null}
            </Pressable>
            {entry.hasChildren && !searching ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Browse ${entry.name}`}
                disabled={!enabled || loading}
                className="min-h-11 min-w-11 items-center justify-center"
                onPress={() => browse(entry.categoryKey)}
              >
                <Icon
                  name="ChevronRight"
                  className="size-5 text-muted-foreground"
                />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {!loading && !request.isError && !rows.length ? (
        <Text className="text-sm text-muted-foreground">
          {searching
            ? "No matching category. Try a broader product or service name."
            : "This category has no subcategories."}
        </Text>
      ) : null}
      {!searching && tree.data?.nextCursor ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center"
          onPress={() => setAfter(tree.data?.nextCursor ?? undefined)}
        >
          <Text className="font-bold text-primary">More categories</Text>
        </Pressable>
      ) : null}
      {!searching && after ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center"
          onPress={() => setAfter(undefined)}
        >
          <Text className="font-bold text-primary">First page</Text>
        </Pressable>
      ) : null}
      {!searching && tree.data?.breadcrumbs.at(-1) ? (
        <Pressable
          accessibilityRole="button"
          disabled={!enabled || loading}
          className="min-h-11 justify-center"
          onPress={() =>
            model.setCategory(
              tree.data?.breadcrumbs.at(-1)?.label ?? model.category,
            )
          }
        >
          <Text className="font-bold text-primary">Use this category</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
