import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { View } from "react-native"
import type { CatalogVariantRowProps } from "@/components/mobile/catalog-setup/catalog-variant-model"
export function ClassicServicePricingModeOption({
  description,
  label,
  onPress,
  selected,
}: {
  description: string
  label: string
  onPress: () => void
  selected: boolean
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <Pressable
      accessibilityLabel={`${label}. ${description}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={
        selected
          ? largeTextLayout
            ? "min-h-20 w-full justify-between gap-2 rounded-2xl border-2 border-primary bg-muted px-4 py-3"
            : "min-h-20 min-w-0 flex-1 justify-between gap-2 rounded-2xl border-2 border-primary bg-muted px-4 py-3"
          : largeTextLayout
            ? "min-h-20 w-full justify-between gap-2 rounded-2xl border border-border bg-background px-4 py-3"
            : "min-h-20 min-w-0 flex-1 justify-between gap-2 rounded-2xl border border-border bg-background px-4 py-3"
      }
      haptic
      onPress={onPress}
      transition
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="min-w-0 flex-1 font-bold text-foreground">
          {label}
        </Text>
        {selected ? (
          <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
            <Icon className="size-xs text-primary-foreground" name="Check" />
          </View>
        ) : (
          <View className="h-6 w-6 rounded-full border border-border" />
        )}
      </View>
      <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
        {description}
      </Text>
    </Pressable>
  )
}

export function ClassicCatalogVariantRow({
  row,
  kind,
  disabled,
  onEdit,
  onMenu,
}: CatalogVariantRowProps) {
  const largeTextLayout = useLargeTextLayout()
  const listingTitle = row.title
  const listingSummary = row.summary
  const listingUnit = { stock: row.stock }
  const stockNeedsSetup = row.stockNeedsSetup
  const priceNeedsSetup = row.priceNeedsSetup
  const listingNeedsSetup = stockNeedsSetup || priceNeedsSetup
  const resolvedPrice = row.price
  return (
    <View
      className={
        row.enabled
          ? largeTextLayout
            ? "-mx-2 flex-row items-start gap-1 border-b border-border"
            : "-mx-2 flex-row items-center gap-1 border-b border-border"
          : largeTextLayout
            ? "-mx-2 flex-row items-start gap-1 border-b border-border opacity-60"
            : "-mx-2 flex-row items-center gap-1 border-b border-border opacity-60"
      }
    >
      <Pressable
        disabled={disabled}
        accessibilityState={{ disabled }}
        accessibilityHint="Opens this listing for editing"
        accessibilityLabel={`Edit ${listingTitle}`}
        className={
          kind === "product"
            ? "min-h-24 min-w-0 flex-1 gap-3 px-3 py-4 active:bg-muted/70"
            : "min-h-20 min-w-0 flex-1 justify-center gap-1 px-3 py-4"
        }
        haptic
        onPress={onEdit}
        transition
      >
        <View
          className={
            kind === "product" && largeTextLayout
              ? "gap-1"
              : kind === "product"
                ? "flex-row items-start gap-2"
                : "flex-row items-center gap-2"
          }
        >
          <Text
            className="min-w-0 flex-1 font-bold text-foreground"
            numberOfLines={largeTextLayout ? undefined : 2}
          >
            {listingTitle}
          </Text>
          {!row.enabled ? (
            <Text className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-muted-foreground">
              Disabled
            </Text>
          ) : kind === "product" ? (
            <Text className="self-start pt-0.5 text-[10px] font-bold uppercase tracking-[0.8px] text-primary">
              {listingNeedsSetup ? "Needs setup" : "Ready"}
            </Text>
          ) : null}
        </View>
        {kind === "product" ? (
          <View
            className={
              largeTextLayout ? "gap-2" : "flex-row items-center gap-2"
            }
          >
            <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">
              <View className="min-h-7 flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                <View
                  className={
                    stockNeedsSetup
                      ? "h-1.5 w-1.5 rounded-full bg-primary"
                      : "h-1.5 w-1.5 rounded-full bg-muted-foreground"
                  }
                />
                <Text className="text-[11px] font-bold text-muted-foreground">
                  {listingUnit.stock}
                </Text>
              </View>
              <View className="min-h-7 flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                <View
                  className={
                    priceNeedsSetup
                      ? "h-1.5 w-1.5 rounded-full bg-primary"
                      : "h-1.5 w-1.5 rounded-full bg-muted-foreground"
                  }
                />
                <Text className="text-[11px] font-bold text-muted-foreground">
                  {resolvedPrice}
                </Text>
              </View>
            </View>
            <View
              className={
                largeTextLayout
                  ? "min-h-11 w-full flex-row items-center justify-end gap-1"
                  : "min-h-11 flex-row items-center gap-1 pl-2"
              }
            >
              <Text className="text-xs font-bold text-primary">
                {listingNeedsSetup ? "Set up" : "Edit"}
              </Text>
              <Icon className="size-xs text-primary" name="ChevronRight" />
            </View>
          </View>
        ) : (
          <View className="flex-row items-center gap-2">
            <Text
              className="min-w-0 flex-1 text-xs [-rn-line-height:20] text-muted-foreground"
              numberOfLines={largeTextLayout ? undefined : 2}
            >
              {listingSummary}
            </Text>
            <Icon
              className={
                largeTextLayout
                  ? "mt-1 size-xs text-muted-foreground"
                  : "size-xs text-muted-foreground"
              }
              name="ChevronRight"
            />
          </View>
        )}
        {row.description ? (
          <Text
            className="text-xs [-rn-line-height:20] text-muted-foreground"
            numberOfLines={largeTextLayout ? undefined : 2}
          >
            {row.description}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        disabled={disabled}
        accessibilityState={{ disabled }}
        accessibilityLabel={`Open ${listingTitle} menu`}
        className={
          kind === "product"
            ? largeTextLayout
              ? "mt-4 min-h-11 min-w-16 items-center justify-center rounded-full px-4 active:bg-muted"
              : "min-h-11 min-w-16 items-center justify-center rounded-full px-4 active:bg-muted"
            : largeTextLayout
              ? "mr-1 mt-4 h-11 w-11 items-center justify-center rounded-full bg-transparent active:bg-muted"
              : "mr-1 h-11 w-11 items-center justify-center rounded-full bg-transparent active:bg-muted"
        }
        haptic
        onPress={onMenu}
        transition
      >
        <Icon className="size-sm text-foreground" name="more" />
      </Pressable>
    </View>
  )
}
