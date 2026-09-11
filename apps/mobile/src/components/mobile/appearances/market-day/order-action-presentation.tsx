import {
  ActionButton,
  MarketDayActionButton,
} from "@/components/mobile/action-button"
import type {
  OrderActionStackProps,
  OrderActionSummaryProps,
  OrderConfirmationDetailProps,
  OrderPaymentChoiceProps,
} from "@/components/mobile/order-detail/order-action-presentation"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { COMPACT_CONTROL_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { cn } from "@/lib/utils"

export function OrderQuietSummary({ label, value }: OrderActionSummaryProps) {
  const largeText = useLargeTextLayout()
  return (
    <View
      className={cn(
        "min-h-[58px] justify-between gap-4 rounded-[14px] border-[length:var(--native-hairline)] border-market-line bg-market-field px-[14px] py-[10px]",
        largeText ? "items-start" : "flex-row items-center",
      )}
    >
      <Text
        className={cn(
          "min-w-0 text-[11px] font-extrabold tracking-[1.3px] text-market-muted-ink [-rn-line-height:18]",
          !largeText && "flex-1",
        )}
        maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
      >
        {label}
      </Text>
      <Text
        className="text-[20px] font-extrabold tabular-nums text-market-ink [-rn-line-height:30]"
        maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
        selectable
      >
        {value}
      </Text>
    </View>
  )
}

export function OrderQuietActionStack({
  actionLabel,
  cancelLabel = "Cancel",
  disabled,
  isLoading,
  loadingLabel,
  onCancel,
  onConfirm,
}: OrderActionStackProps) {
  return (
    <View className="gap-1">
      <MarketDayActionButton
        disabled={disabled}
        isLoading={isLoading}
        loadingLabel={loadingLabel}
        onPress={onConfirm}
        tone="palm"
      >
        {actionLabel}
      </MarketDayActionButton>
      <ActionButton onPress={onCancel} variant="ghost">
        {cancelLabel}
      </ActionButton>
    </View>
  )
}

export function MarketDayOrderPaymentChoice({
  label,
  selected,
  onPress,
}: OrderPaymentChoiceProps) {
  const largeText = useLargeTextLayout()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={cn(
        "items-center justify-center rounded-xl",
        largeText ? "min-h-14 min-w-[46%] flex-1 px-4" : "min-h-11 px-3",
        selected
          ? "bg-market-palm"
          : "border border-market-line bg-market-field",
      )}
      haptic
      onPress={onPress}
    >
      <Text
        className={cn(
          "text-[14px] font-bold [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          largeText ? "[-rn-line-height:24]" : "[-rn-line-height:20]",
          selected ? "text-market-on-palm" : "text-market-ink",
        )}
        maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function MarketDayOrderConfirmationDetail({
  presentation,
}: OrderConfirmationDetailProps) {
  const largeText = useLargeTextLayout()
  return (
    <View
      className={cn(
        "gap-4 border-b-[length:var(--native-hairline)] border-market-line pb-[14px]",
        largeText ? "items-start" : "flex-row items-center",
      )}
    >
      <View className={cn("min-w-0 gap-1", !largeText && "flex-1")}>
        <Text
          className="text-[16px] font-extrabold text-market-ink [-rn-line-height:24]"
          maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
          selectable
        >
          {presentation.detailTitle}
        </Text>
        <Text
          className="text-[14px] text-market-muted-ink [-rn-line-height:22]"
          maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
          selectable
        >
          {presentation.detail}
        </Text>
      </View>
      <Text
        className="text-[14px] font-extrabold text-market-palm [-rn-line-height:22]"
        maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
        numberOfLines={1}
      >
        Ready
      </Text>
    </View>
  )
}

export function MarketDayOrderActionWarning({ message }: { message: string }) {
  return (
    <View className="rounded-[10px] border-[length:var(--native-hairline)] border-market-line border-l-[3px] border-l-market-paprika bg-market-field px-[14px] py-[11px]">
      <Text
        className="text-[14px] text-market-ink [-rn-line-height:22]"
        maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
        selectable
      >
        {message}
      </Text>
    </View>
  )
}
