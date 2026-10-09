import { catalogAvatarTint } from "@/components/mobile/catalog/catalog-shelf-model"
import type {
  CustomerActionRowProps,
  CustomerSuggestionRowProps,
  SaleStageHeaderProps,
  SaleTopBarProps,
  SelectedOrderLineProps,
} from "@/components/mobile/create-sale/create-sale-presentation"
import { stepSaleQuantity } from "@/components/mobile/create-sale/sale-unit-count"
import { saleLineTotalMinor } from "@/components/mobile/sale-checkout-model"
import {
  SaleItemAvatar,
  saleOfferingTitle,
} from "@/components/mobile/sale-item-picker"
import { getSaleOfferingStockLabel } from "@/components/mobile/sale-item-picker-model"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { Text as NativeText, TextInput } from "react-native"

/** Classic renders the step title in its fixed top bar instead. */
export function ClassicSaleStageHeader(_props: SaleStageHeaderProps) {
  return null
}

export function ClassicSaleTopBar({
  onBack,
  onClose,
  step,
  subtitle,
  title,
}: SaleTopBarProps) {
  return (
    <View className="min-h-11 flex-row items-center gap-2.5 px-4 pt-1 pb-2.5">
      {onBack ? (
        <Pressable
          accessibilityLabel="Go to previous sale step"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
          haptic
          onPress={onBack}
          transition
        >
          <Icon className="size-[20px] text-foreground" name="ArrowLeft" />
        </Pressable>
      ) : null}
      <View className="min-w-0 flex-1">
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="text-[17px] font-extrabold tracking-tight text-foreground"
        >
          {title}
        </Text>
        <Text
          accessibilityLabel={`Step ${step} of 3`}
          numberOfLines={1}
          className="text-xs font-semibold text-muted-foreground"
        >
          {`Step ${step} of 3${subtitle ? ` · ${subtitle}` : ""}`}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Close create sale"
        accessibilityRole="button"
        className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
        haptic
        onPress={onClose}
        transition
      >
        <Icon className="size-[20px] text-foreground" name="X" />
      </Pressable>
    </View>
  )
}

export function ClassicSelectedOrderLine({
  disabled = false,
  offering,
  onQuantityChange,
  onQuantityBlur,
  onQuantityFocus,
  onRemove,
  position = { first: true, last: true },
  quantity,
}: SelectedOrderLineProps) {
  const largeText = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  const tint = catalogAvatarTint(
    offering.itemName,
    offering.kind === "service" ? "service" : "product",
  )
  const lineTotalMinor = saleLineTotalMinor(offering.fixedPriceMinor, quantity)
  const single = !quantity || stepSaleQuantity(quantity, -1) === "0"
  return (
    <View
      className={cn(
        "bg-card px-3.5",
        position.first && "rounded-t-[20px]",
        position.last && "rounded-b-[20px]",
      )}
    >
      <View
        className={cn(
          "min-h-[66px] gap-2.5 py-3",
          !largeText && "flex-row items-center",
          !position.last && "border-b border-border",
        )}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette[tint],
            borderRadius: 13,
            height: 42,
            justifyContent: "center",
            overflow: "hidden",
            width: 42,
          }}
        >
          {offering.imageUrl ? (
            <SaleItemAvatar choice={offering} />
          ) : (
            <NativeText
              maxFontSizeMultiplier={1.3}
              style={{
                color: palette[`${tint}Foreground`],
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              {Array.from(offering.itemName.trim())[0]?.toUpperCase() ?? "?"}
            </NativeText>
          )}
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={largeText ? undefined : 1}
            className="text-sm font-bold text-foreground"
          >
            {saleOfferingTitle(offering)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {[
              offering.fixedPriceMinor === null
                ? "Price not set"
                : wholeMoney(
                    formatMinorMoney(
                      offering.fixedPriceMinor,
                      offering.currencyCode,
                    ),
                  ),
              getSaleOfferingStockLabel({
                availableQuantity: offering.availableQuantity,
                kind: offering.kind,
                unitName: offering.unitName ?? offering.offeringName,
              }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {lineTotalMinor !== null ? (
            <Text className="text-xs font-bold tabular-nums text-foreground">
              {wholeMoney(
                formatMinorMoney(lineTotalMinor, offering.currencyCode),
              )}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.accent,
            borderRadius: 13,
            flexDirection: "row",
            height: 44,
            justifyContent: "space-between",
            width: 120,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              single
                ? `Remove ${offering.displayName} from order`
                : `Decrease ${offering.displayName} quantity by one`
            }
            disabled={disabled}
            className="size-11 items-center justify-center"
            haptic
            onPress={() => {
              const next = stepSaleQuantity(quantity, -1)
              if (next === "0") onRemove()
              else onQuantityChange(next)
            }}
          >
            <Icon
              className="size-[17px]"
              color={colors.accentForeground}
              name={single ? "X" : "Minus"}
            />
          </Pressable>
          <TextInput
            accessibilityLabel={`Quantity for ${offering.displayName}`}
            editable={!disabled}
            keyboardType="decimal-pad"
            maxFontSizeMultiplier={1.3}
            onBlur={onQuantityBlur}
            onChangeText={onQuantityChange}
            onFocus={onQuantityFocus}
            selectTextOnFocus
            selectionColor={colors.primary}
            style={{
              color: colors.foreground,
              fontSize: 15,
              fontVariant: ["tabular-nums"],
              fontWeight: "700",
              minWidth: 26,
              padding: 0,
              textAlign: "center",
            }}
            value={quantity}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${offering.displayName} quantity by one`}
            disabled={disabled}
            className="size-11 items-center justify-center"
            haptic
            onPress={() => onQuantityChange(stepSaleQuantity(quantity, 1))}
          >
            <Icon
              className="size-[17px]"
              color={colors.accentForeground}
              name="Plus"
            />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const wholeMoney = (value: string) => value.replace(/\.00(?=\D*$)/, "")

export function ClassicCustomerActionRow({
  icon,
  onPress,
  title,
}: CustomerActionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-border px-2 py-4 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-tint-lilac">
        <Icon className="size-[18px] text-primary" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{title}</Text>
      </View>
      <Icon className="size-[18px] text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

export function ClassicCustomerSuggestionRow({
  customer,
  onPress,
}: CustomerSuggestionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-border px-2 py-4 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-tint-lilac">
        <Text className="text-xs font-extrabold text-foreground">
          {customer.initials}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{customer.name}</Text>
        <Text className="text-xs text-muted-foreground">
          {[
            customer.directoryId ? "Saved customer" : "Previous sale contact",
            customer.phone,
            customer.email,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <Icon className="size-[18px] text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}
