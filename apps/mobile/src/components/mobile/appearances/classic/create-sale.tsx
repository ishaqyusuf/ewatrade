import type {
  SaleStageHeaderProps,
  SelectedOrderLineProps,
  CustomerActionRowProps,
  CustomerSuggestionRowProps,
} from "@/components/mobile/create-sale/create-sale-presentation"
import { FormField } from "@/components/mobile/form-field"
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
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"

export function ClassicSaleStageHeader({
  current,
  description,
  onBack,
  title,
}: SaleStageHeaderProps) {
  return (
    <View className="gap-3 pb-5 pt-1">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-bold uppercase tracking-[1.4px] text-primary">
            Step {current} of 3
          </Text>
          <Text className="text-xl font-extrabold text-foreground">
            {title}
          </Text>
        </View>
        {onBack ? (
          <Pressable
            accessibilityLabel="Go to previous sale step"
            className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-accent"
            haptic
            onPress={onBack}
            transition
          >
            <Icon className="size-sm text-foreground" name="ArrowLeft" />
          </Pressable>
        ) : null}
      </View>
      <Text className="text-sm [-rn-line-height:20] text-muted-foreground">
        {description}
      </Text>
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
  quantity,
}: SelectedOrderLineProps) {
  const largeText = useLargeTextLayout()
  const lineTotalMinor = saleLineTotalMinor(offering.fixedPriceMinor, quantity)
  const stockLabel = getSaleOfferingStockLabel({
    availableQuantity: offering.availableQuantity,
    kind: offering.kind,
    unitName: offering.unitName ?? offering.offeringName,
  })

  return (
    <View className="border-b border-border py-4">
      <View className="min-h-11 flex-row items-center gap-3">
        <SaleItemAvatar choice={offering} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">
            {saleOfferingTitle(offering)}
          </Text>
          {stockLabel ? (
            <Text className="text-xs font-semibold text-primary">
              {stockLabel}
            </Text>
          ) : null}
          <Text className="text-xs [-rn-line-height:16] text-muted-foreground">
            {offering.offeringName} ·{" "}
            {offering.fixedPriceMinor === null
              ? "Price not set"
              : formatMinorMoney(
                  offering.fixedPriceMinor,
                  offering.currencyCode,
                )}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`Remove ${offering.displayName} from order`}
          disabled={disabled}
          accessibilityState={{ disabled }}
          className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-accent"
          haptic
          onPress={onRemove}
          transition
        >
          <Icon className="size-sm text-muted-foreground" name="X" />
        </Pressable>
      </View>

      <View
        className={cn(
          "mt-3 gap-3",
          largeText ? "flex-col" : "flex-row items-start pl-[56px]",
        )}
      >
        <View className={cn("min-w-0 gap-1", !largeText && "flex-1")}>
          <Text className="text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">
            Unit
          </Text>
          <Text className="min-h-12 py-3 text-sm font-extrabold text-foreground">
            {offering.unitName ?? offering.offeringName}
          </Text>
        </View>
        <View className={cn("gap-1", largeText ? "w-full" : "w-20")}>
          <Text className="text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">
            Qty
          </Text>
          <FormField
            editable={!disabled}
            accessibilityLabel={`Quantity for ${offering.displayName}`}
            inputClassName="text-center font-extrabold"
            inputTextAlign="center"
            keyboardType="decimal-pad"
            label="Quantity"
            onBlur={onQuantityBlur}
            onChangeText={onQuantityChange}
            onFocus={onQuantityFocus}
            selectTextOnFocus
            value={quantity}
            variant="auth"
          />
        </View>
        <View className="min-w-[104px] items-end gap-1">
          <Text className="text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground">
            Price
          </Text>
          <Text className="min-h-12 py-3 text-right text-sm font-extrabold text-foreground">
            {offering.fixedPriceMinor === null
              ? "—"
              : formatMinorMoney(
                  offering.fixedPriceMinor,
                  offering.currencyCode,
                )}
          </Text>
        </View>
      </View>
      {lineTotalMinor !== null ? (
        <Text className="mt-2 text-right text-xs font-bold text-muted-foreground">
          Line total {formatMinorMoney(lineTotalMinor, offering.currencyCode)}
        </Text>
      ) : null}
    </View>
  )
}

export function ClassicCustomerActionRow({
  description,
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
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{description}</Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
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
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Text className="text-xs font-extrabold text-foreground">
          {customer.initials}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{customer.name}</Text>
        <Text className="text-xs text-muted-foreground">
          {[customer.phone, customer.email].filter(Boolean).join(" · ") ||
            "Recent customer"}
        </Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}
