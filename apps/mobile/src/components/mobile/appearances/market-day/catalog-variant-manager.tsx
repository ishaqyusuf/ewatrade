import type { ComponentProps } from "react"
import type { ClassicServicePricingModeOption } from "../classic/catalog-variant-manager"
import type { CatalogVariantRowProps } from "@/components/mobile/catalog-setup/catalog-variant-model"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import { cn } from "@/lib/utils"

export function MarketCatalogVariantRow({
  row,
  kind,
  disabled,
  onEdit,
  onMenu,
}: CatalogVariantRowProps) {
  return (
    <View
      className={cn(
        "mb-3 flex-row items-start rounded-2xl border border-market-line bg-market-field",
        !row.enabled && "opacity-60",
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${row.title}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onEdit}
        className="min-h-24 min-w-0 flex-1 gap-3 px-4 py-4"
        haptic
      >
        <Text className="text-base font-extrabold text-market-ink">
          {row.title}
        </Text>
        <Text className="text-xs font-bold text-market-accent-ink">
          {!row.enabled
            ? "Disabled"
            : row.stockNeedsSetup || row.priceNeedsSetup
              ? "Needs setup"
              : "Configured"}
        </Text>
        <View className="gap-2 border-t border-market-line pt-3">
          <Text className="text-base font-extrabold text-market-ink">
            {row.price}
          </Text>
          <Text className="text-xs text-market-muted-ink [-rn-line-height:20]">
            {kind === "product" ? row.stock : "Service · No inventory"}
          </Text>
        </View>
        {row.description ? (
          <Text className="text-xs text-market-muted-ink [-rn-line-height:20]">
            {row.description}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-bold text-market-accent-ink">
            Edit configuration
          </Text>
          <Icon
            name="ChevronRight"
            className="size-xs text-market-accent-ink"
          />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${row.title} menu`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onMenu}
        className="m-2 min-h-11 min-w-11 items-center justify-center rounded-full bg-market-soft-band"
        haptic
      >
        <Icon name="more" className="size-sm text-market-ink" />
      </Pressable>
    </View>
  )
}

export function MarketServicePricingModeOption({
  description,
  label,
  selected,
  onPress,
}: ComponentProps<typeof ClassicServicePricingModeOption>) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ selected }}
      onPress={onPress}
      haptic
      className={cn(
        "min-h-20 flex-row items-start gap-3 rounded-2xl border px-4 py-4",
        selected ? "border-market-palm bg-market-field" : "border-market-line",
      )}
    >
      <View
        className={cn(
          "size-6 shrink-0 items-center justify-center rounded-full",
          selected ? "bg-market-palm" : "border border-market-line",
        )}
      >
        {selected ? (
          <Icon name="Check" className="size-xs text-market-on-palm" />
        ) : null}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-market-ink">{label}</Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:20]">
          {description}
        </Text>
      </View>
    </Pressable>
  )
}
