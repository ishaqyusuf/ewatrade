import type {
  CustomerActionRowProps,
  CustomerSuggestionRowProps,
  SaleStageHeaderProps,
  SelectedOrderLineProps,
} from "@/components/mobile/create-sale/create-sale-presentation"
import { stepSaleQuantity } from "@/components/mobile/create-sale/sale-unit-count"
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
          <Text className="text-[23px] font-extrabold text-foreground">
            {title}
          </Text>
        </View>
        {onBack ? (
          <Pressable
            accessibilityLabel="Go to previous sale step"
            className="h-11 w-11 items-center justify-center rounded-[14px] bg-tint-lilac active:bg-accent"
            haptic
            onPress={onBack}
            transition
          >
            <Icon className="size-[18px] text-foreground" name="ArrowLeft" />
          </Pressable>
        ) : null}
      </View>
      <View
        accessibilityLabel={`Step ${current} of 3`}
        className="flex-row gap-2"
      >
        {[1, 2, 3].map((step) => (
          <View
            key={step}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              step <= current ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </View>
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
    <View className="mb-3.5 rounded-[20px] bg-card p-3.5">
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
          className="h-11 w-11 items-center justify-center rounded-[14px] bg-tint-lilac active:bg-accent"
          haptic
          onPress={onRemove}
          transition
        >
          <Icon className="size-[18px] text-muted-foreground" name="X" />
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
      <View className="mt-3 flex-row items-center justify-end gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${offering.displayName} quantity by one`}
          disabled={disabled}
          className="size-[44px] items-center justify-center rounded-[14px] bg-muted"
          onPress={() => {
            const next = stepSaleQuantity(quantity, -1)
            if (next === "0") onRemove()
            else onQuantityChange(next)
          }}
        >
          <Icon name="Minus" className="size-[20px] text-foreground" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${offering.displayName} quantity by one`}
          disabled={disabled}
          className="size-[44px] items-center justify-center rounded-[14px] bg-tint-mint"
          onPress={() => onQuantityChange(stepSaleQuantity(quantity, 1))}
        >
          <Icon name="Plus" className="size-[20px] text-primary" />
        </Pressable>
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
