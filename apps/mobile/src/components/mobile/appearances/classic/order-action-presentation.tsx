import { ActionButton } from "@/components/mobile/action-button"
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

export function ClassicOrderActionSummary({
  label,
  value,
}: OrderActionSummaryProps) {
  return (
    <View className="gap-1">
      <Text className="text-lg font-extrabold text-foreground" selectable>
        {label}
      </Text>
      <Text
        className="text-2xl font-extrabold tabular-nums text-foreground"
        selectable
      >
        {value}
      </Text>
    </View>
  )
}

export function ClassicOrderActionStack({
  actionLabel,
  cancelLabel = "Cancel",
  disabled,
  isLoading,
  loadingLabel,
  onCancel,
  onConfirm,
}: OrderActionStackProps) {
  const largeText = useLargeTextLayout()
  return (
    <View className={largeText ? "gap-2" : "flex-row gap-3"}>
      <ActionButton
        className={largeText ? "w-full" : "w-auto flex-1"}
        onPress={onCancel}
        variant="outline"
      >
        {cancelLabel}
      </ActionButton>
      <ActionButton
        className={largeText ? "w-full" : "w-auto flex-1"}
        disabled={disabled}
        isLoading={isLoading}
        loadingLabel={loadingLabel}
        onPress={onConfirm}
      >
        {actionLabel}
      </ActionButton>
    </View>
  )
}

export function ClassicOrderPaymentChoice({
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
        "items-center justify-center rounded-xl px-4",
        largeText ? "min-h-14 min-w-[46%] flex-1" : "min-h-11",
        selected ? "bg-foreground" : "border border-border bg-card",
      )}
      haptic
      onPress={onPress}
    >
      <Text
        className={cn(
          "text-[14px] font-bold [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          largeText ? "[-rn-line-height:24]" : "[-rn-line-height:20]",
          selected ? "text-background" : "text-foreground",
        )}
        maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function ClassicOrderConfirmationDetail({
  presentation,
}: OrderConfirmationDetailProps) {
  return (
    <View className="gap-1 border-y border-border py-4">
      <Text className="text-base font-extrabold text-foreground" selectable>
        {presentation.detailTitle}
      </Text>
      <Text className="text-sm text-muted-foreground" selectable>
        {presentation.detail}
      </Text>
      <Text className="mt-2 text-sm font-bold text-primary">Ready</Text>
    </View>
  )
}

export function ClassicOrderActionWarning({ message }: { message: string }) {
  return (
    <View className="rounded-xl bg-muted p-4">
      <Text className="text-sm text-foreground" selectable>
        {message}
      </Text>
    </View>
  )
}
