import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { FormField } from "@/components/mobile/form-field"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { CATALOG_CATEGORY_PRESETS } from "@ewatrade/utils/catalog-category-presets"
import { getCatalogIllustrations } from "@ewatrade/utils/catalog-illustrations"
import { rankBySearch } from "@ewatrade/utils/search-rank"
import { useMemo, useState } from "react"
import { ScrollView, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { CatalogIllustrationPreview } from "./catalog-illustration-library"

/**
 * Illustration library as a full-screen modal with search at the bottom
 * (owner revision, 9 Oct 2026). Tap to pick, then Use; search ranks the whole
 * library by label and tags.
 */
export function CatalogIllustrationBrowser({
  kind,
  businessProfileKey,
  categoryKey,
  itemName,
  selectedId,
  onClose,
  onUse,
}: {
  kind: "product" | "service"
  businessProfileKey?: string | null
  categoryKey?: string | null
  itemName: string
  selectedId?: string | null
  onClose: () => void
  onUse: (id: string) => void
}) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const [picked, setPicked] = useState<string | null>(selectedId ?? null)
  const [tab, setTab] = useState<"recommended" | "all">("recommended")
  const [root, setRoot] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [footerHeight, setFooterHeight] = useState(96)
  const everything = useMemo(
    () =>
      getCatalogIllustrations({
        kind,
        businessProfileKey,
        categoryKey,
        all: true,
      }),
    [kind, businessProfileKey, categoryKey],
  )
  const recommended = everything.filter((entry) => entry.recommended)
  const roots = useMemo(() => {
    const keys = [
      ...new Set(
        everything.flatMap(({ illustration }) =>
          illustration.categoryKeys.map((key) => key.split(":")[0] ?? key),
        ),
      ),
    ]
    return keys
      .map((key) => ({
        key,
        label:
          CATALOG_CATEGORY_PRESETS.find((preset) => preset.key === key)
            ?.label ?? key,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [everything])
  const searching = Boolean(query.trim())
  const entries = searching
    ? rankBySearch(everything, query, ({ illustration }) => [
        { text: illustration.label },
        { text: illustration.searchTags.join(" "), weight: 0.8 },
        {
          text: illustration.categoryKeys.join(" ").replace(/[:-]/g, " "),
          weight: 0.6,
        },
      ])
    : tab === "recommended" && recommended.length
      ? recommended
      : everything.filter(
          ({ illustration }) =>
            !root ||
            illustration.categoryKeys.some((key) => key.startsWith(`${root}`)),
        )
  const pickedLabel = everything.find(
    ({ illustration }) => illustration.id === picked,
  )?.illustration.label

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          zIndex: 40,
        },
      ]}
      testID="catalog-illustration-browser"
    >
      <View className="flex-row items-center gap-2.5 px-[18px] pt-1 pb-3">
        <Pressable
          accessibilityLabel="Close illustrations"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
          haptic
          onPress={onClose}
        >
          <Icon className="size-[20px] text-foreground" name="X" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text
            accessibilityRole="header"
            className="text-[17px] font-extrabold tracking-tight text-foreground"
          >
            Illustrations
          </Text>
          <Text
            numberOfLines={1}
            className="text-xs font-semibold text-muted-foreground"
          >
            {picked
              ? "1 selected"
              : `Pick one for ${itemName.trim() || "this item"}`}
          </Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: footerHeight + 24,
          paddingHorizontal: 18,
        }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {searching ? null : (
          <View className="flex-row rounded-[13px] border border-border bg-muted p-[3px]">
            {(
              [
                ["recommended", "Recommended"],
                ["all", `All ${everything.length}`],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: tab === value }}
                className={cn(
                  "min-h-9 flex-1 items-center justify-center rounded-[10px]",
                  tab === value ? "bg-card shadow-sm" : "bg-transparent",
                )}
                haptic
                onPress={() => setTab(value)}
              >
                <Text
                  className={cn(
                    "text-[13px] font-bold",
                    tab === value ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {!searching && tab === "all" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 18 }}
            style={{ marginHorizontal: -18, marginTop: 10 }}
          >
            {[{ key: "", label: "All" }, ...roots].map((entry) => {
              const on = (root ?? "") === entry.key
              return (
                <Pressable
                  key={entry.key || "all"}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  className={cn(
                    "min-h-9 justify-center rounded-full border-[1.5px] px-3.5",
                    on
                      ? "border-primary/40 bg-accent"
                      : "border-transparent bg-muted",
                  )}
                  onPress={() => setRoot(entry.key || null)}
                >
                  <Text
                    className={cn(
                      "text-[12.5px] font-bold",
                      on ? "text-accent-foreground" : "text-foreground",
                    )}
                  >
                    {entry.label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        ) : null}
        <View className="mt-3.5 flex-row flex-wrap gap-2.5">
          {entries.map(({ illustration }) => {
            const on = picked === illustration.id
            return (
              <Pressable
                key={illustration.id}
                accessibilityRole="radio"
                accessibilityLabel={`Choose ${illustration.label}`}
                accessibilityState={{ selected: on }}
                haptic
                onPress={() => setPicked(on ? null : illustration.id)}
                style={{ width: "31.4%" }}
              >
                <View
                  className={cn(
                    "aspect-square items-center justify-center rounded-[14px] border-2 shadow-sm",
                    on
                      ? "border-primary bg-accent"
                      : "border-transparent bg-card",
                  )}
                >
                  <CatalogIllustrationPreview id={illustration.id} size={64} />
                  {on ? (
                    <View className="absolute top-1.5 right-1.5 size-[22px] items-center justify-center rounded-full bg-primary">
                      <Icon
                        className="size-[13px]"
                        color={colors.primaryForeground}
                        name="Check"
                      />
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={2}
                  className="mt-1.5 text-center text-xs font-bold text-foreground"
                >
                  {illustration.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        {!entries.length ? (
          <Text className="py-8 text-center text-[13px] text-muted-foreground">
            No illustration matches “{query.trim()}”.
          </Text>
        ) : null}
      </ScrollView>
      <BottomSearchFooter
        accessibilityLabel="Illustration actions"
        onChangeText={() => undefined}
        onHeightChange={setFooterHeight}
        placeholder=""
        searchVisible={false}
        totalCount={0}
        value=""
        variant="action-bar"
      >
        {picked ? (
          <ActionButton icon="Check" onPress={() => onUse(picked)}>
            {`Use ${pickedLabel?.toLowerCase() ?? "illustration"}`}
          </ActionButton>
        ) : null}
        <FormField
          accessibilityLabel="Search illustrations"
          autoCapitalize="none"
          autoCorrect={false}
          label="Search illustrations"
          leadingIcon="Search"
          onChangeText={setQuery}
          placeholder={`Search ${everything.length} illustrations`}
          returnKeyType="search"
          value={query}
          variant="search"
        />
      </BottomSearchFooter>
    </View>
  )
}
