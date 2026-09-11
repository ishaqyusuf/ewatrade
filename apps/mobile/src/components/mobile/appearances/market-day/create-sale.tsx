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
import type { SaleTotalProps } from "@/components/mobile/create-sale/create-sale-presentation"
import { Icon } from "@/components/ui/icon"
import type { SaleSegmentOptionProps } from "@/components/mobile/sale-flow"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"

export function MarketDaySaleStageHeader({
  current,
  description,
  onBack,
  title,
}: SaleStageHeaderProps) {
  return (
    <View className="-mx-4 mb-5 gap-3 border-b-[6px] border-market-marigold bg-market-palm px-4 pb-6 pt-2">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-market-mono text-[11px] font-bold uppercase tracking-[1.4px] text-market-on-palm-muted">
            Step {current} of 3
          </Text>
          <Text className="font-market-display text-[34px] font-black text-market-on-palm [-rn-line-height:40]">
            {title}
          </Text>
        </View>
        {onBack ? (
          <Pressable
            accessibilityLabel="Go to previous sale step"
            className="h-11 w-11 items-center justify-center rounded-full bg-market-field active:bg-market-soft-band"
            haptic
            onPress={onBack}
            transition
          >
            <Icon className="size-sm text-market-ink" name="ArrowLeft" />
          </Pressable>
        ) : null}
      </View>
      <Text className="text-sm [-rn-line-height:20] text-market-on-palm-muted">
        {description}
      </Text>
    </View>
  )
}

export function MarketDaySelectedOrderLine({
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
    <View className="border-b border-market-line py-4">
      <View className="min-h-11 flex-row items-center gap-3">
        <SaleItemAvatar choice={offering} appearance="market-day" />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-market-ink">
            {saleOfferingTitle(offering)}
          </Text>
          {stockLabel ? (
            <Text className="text-xs font-semibold text-market-accent-ink">
              {stockLabel}
            </Text>
          ) : null}
          <Text className="text-xs [-rn-line-height:16] text-market-muted-ink">
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
          className="h-11 w-11 items-center justify-center rounded-full bg-market-field active:bg-market-soft-band"
          haptic
          onPress={onRemove}
          transition
        >
          <Icon className="size-sm text-market-muted-ink" name="X" />
        </Pressable>
      </View>

      <View
        className={cn(
          "mt-3 gap-3",
          largeText ? "flex-col" : "flex-row items-start pl-[56px]",
        )}
      >
        <View className={cn("min-w-0 gap-1", !largeText && "flex-1")}>
          <Text className="text-[10px] font-bold uppercase tracking-[1px] text-market-muted-ink">
            Unit
          </Text>
          <Text className="min-h-12 py-3 text-sm font-extrabold text-market-ink">
            {offering.unitName ?? offering.offeringName}
          </Text>
        </View>
        <View className={cn("gap-1", largeText ? "w-full" : "w-20")}>
          <Text className="text-[10px] font-bold uppercase tracking-[1px] text-market-muted-ink">
            Qty
          </Text>
          <FormField
            editable={!disabled}
            accessibilityLabel={`Quantity for ${offering.displayName}`}
            inputClassName="bg-market-field text-center font-extrabold text-market-ink"
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
          <Text className="text-[10px] font-bold uppercase tracking-[1px] text-market-muted-ink">
            Price
          </Text>
          <Text className="min-h-12 py-3 text-right text-sm font-extrabold text-market-ink">
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
        <Text className="mt-2 text-right text-xs font-bold text-market-muted-ink">
          Line total {formatMinorMoney(lineTotalMinor, offering.currencyCode)}
        </Text>
      ) : null}
    </View>
  )
}

export function MarketDayCustomerActionRow({
  description,
  icon,
  onPress,
  title,
}: CustomerActionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-market-line px-2 py-4 active:bg-market-soft-band"
      haptic
      onPress={onPress}
      transition
    >
      <View className="size-11 items-center justify-center rounded-xl bg-market-marigold">
        <Icon className="size-sm text-market-on-marigold" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-market-ink">{title}</Text>
        <Text className="text-xs text-market-muted-ink">{description}</Text>
      </View>
      <Icon className="size-sm text-market-muted-ink" name="ChevronRight" />
    </Pressable>
  )
}

export function MarketDayCustomerSuggestionRow({
  customer,
  onPress,
}: CustomerSuggestionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-market-line px-2 py-4 active:bg-market-soft-band"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-market-field">
        <Text className="text-xs font-extrabold text-market-ink">
          {customer.initials}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-market-ink">{customer.name}</Text>
        <Text className="text-xs text-market-muted-ink">
          {[customer.phone, customer.email].filter(Boolean).join(" · ") ||
            "Recent customer"}
        </Text>
      </View>
      <Icon className="size-sm text-market-muted-ink" name="ChevronRight" />
    </Pressable>
  )
}

export function MarketDaySaleTotal({ helper, label, value }: SaleTotalProps) {
  return (
    <View className="gap-2 border-b-[4px] border-market-on-marigold-divider bg-market-marigold p-5">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="font-market-mono text-[10px] font-bold uppercase tracking-[1px] text-market-on-marigold">
          {label}
        </Text>
        {helper ? (
          <Text className="text-xs text-market-on-marigold">{helper}</Text>
        ) : null}
      </View>
      <Text className="font-market-display text-[38px] font-black text-market-on-marigold [-rn-line-height:46]">
        {value}
      </Text>
    </View>
  )
}
export function MarketDaySaleSegment({
  className,
  disabled = false,
  icon = "CheckCircle2",
  label,
  onPress,
  selected,
}: SaleSegmentOptionProps) {
  const largeText = useLargeTextLayout()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic
      className={cn(
        "min-h-12 flex-row items-center justify-center gap-2 rounded-full border px-3 py-2",
        !largeText && "flex-1",
        selected
          ? "border-market-palm bg-market-palm"
          : "border-market-line bg-market-field active:bg-market-soft-band",
        className,
      )}
    >
      <Icon
        name={icon}
        className={cn(
          "size-sm",
          selected ? "text-market-on-palm" : "text-market-muted-ink",
        )}
      />
      <Text
        className={cn(
          "shrink text-center text-sm font-bold [-rn-line-height:20] [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          selected ? "text-market-on-palm" : "text-market-ink",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const SALE_TONES: Record<string, string> = {
  "text-foreground": "text-market-ink",
  "text-muted-foreground": "text-market-muted-ink",
  "text-primary": "text-market-accent-ink",
  "text-primary-foreground": "text-market-on-palm",
  "border-border": "border-market-line",
  "bg-border": "bg-market-line",
  "bg-background": "bg-market-canvas",
  "bg-card": "bg-market-field",
  "bg-muted": "bg-market-field",
  "bg-muted/60": "bg-market-field",
  "bg-primary": "bg-market-palm",
  "active:bg-primary/90": "active:bg-market-hero-pressed",
  "active:bg-accent": "active:bg-market-soft-band",
}
export function marketDaySaleClasses(value: string) {
  return value
    .split(" ")
    .map((token) => SALE_TONES[token] ?? token)
    .join(" ")
}
