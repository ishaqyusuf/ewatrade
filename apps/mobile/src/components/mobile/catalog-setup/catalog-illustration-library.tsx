import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { getCatalogIllustrationSvg } from "@ewatrade/utils/catalog-illustration-artwork"
import {
  findCatalogIllustration,
  getCatalogIllustrations,
} from "@ewatrade/utils/catalog-illustrations"
import { CATALOG_CATEGORY_PRESETS } from "@ewatrade/utils/catalog-category-presets"
import { useState } from "react"
import { View } from "react-native"
import { SvgXml } from "react-native-svg"

export function CatalogIllustrationPreview({
  id,
  size = 96,
}: { id: string; size?: number }) {
  const colors = useColors()
  const illustration = findCatalogIllustration(id)
  const xml = getCatalogIllustrationSvg(id, {
    ink: colors.foreground,
    fill: colors.card,
    accent: colors.primary,
    highlight: colors.accent,
  })
  return xml ? (
    <View accessible accessibilityLabel={illustration?.label ?? "Illustration"}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  ) : null
}

export function CatalogIllustrationLibrary({
  kind,
  businessProfileKey,
  categoryKey,
  selectedId,
  disabled,
  onSelect,
}: {
  kind: "product" | "service"
  businessProfileKey?: string | null
  categoryKey?: string | null
  selectedId?: string | null
  disabled: boolean
  onSelect(id: string): void
}) {
  const [query, setQuery] = useState("")
  const [all, setAll] = useState(false)
  const entries = getCatalogIllustrations({
    kind,
    businessProfileKey,
    categoryKey,
    query,
    all: all || Boolean(query.trim()),
  }).filter(({ recommended }) => all || Boolean(query.trim()) || recommended)
  return (
    <View className="gap-4">
      <FormField
        label="Search illustrations"
        placeholder="Search the whole library"
        value={query}
        onChangeText={setQuery}
        editable={!disabled}
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <ActionButton
            disabled={disabled}
            variant={all ? "outline" : "default"}
            onPress={() => setAll(false)}
          >
            Recommended
          </ActionButton>
        </View>
        <View className="flex-1">
          <ActionButton
            disabled={disabled}
            variant={all ? "default" : "outline"}
            onPress={() => setAll(true)}
          >
            Browse all
          </ActionButton>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-3">
        {entries.map(({ illustration, recommended }) => (
          <Pressable
            key={illustration.id}
            accessibilityRole="button"
            accessibilityLabel={`Choose ${illustration.label}`}
            accessibilityState={{
              selected: selectedId === illustration.id,
              disabled,
            }}
            disabled={disabled}
            onPress={() => onSelect(illustration.id)}
            className={`w-[46%] items-center gap-2 rounded-2xl border p-3 ${selectedId === illustration.id ? "border-primary bg-accent" : "border-border bg-card"}`}
          >
            <CatalogIllustrationPreview id={illustration.id} />
            <Text className="text-center font-medium text-foreground">
              {illustration.label}
            </Text>
            {selectedId === illustration.id ? (
              <Text className="text-sm text-primary">Selected</Text>
            ) : recommended && !all ? (
              <Text className="text-xs text-muted-foreground">Recommended</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
      {!entries.length ? (
        <Text className="text-muted-foreground">
          No illustrations match. Try another search.
        </Text>
      ) : null}
    </View>
  )
}

export function catalogIllustrationCategoryKey(category?: string | null) {
  const [label, childLabel] = (category ?? "")
    .split(" / ")
    .map((value) => value.trim().toLowerCase())
  const root = CATALOG_CATEGORY_PRESETS.find(
    (entry) => entry.key === label || entry.label.toLowerCase() === label,
  )
  return (
    root?.subcategories.find(
      (child) => child.key === childLabel || child.label.toLowerCase() === childLabel,
    )?.key ?? root?.key
  )
}
