import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ReactNode } from "react"
import { View } from "react-native"

export function ReportSection({
  title,
  children,
}: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-[20px] bg-card p-4">
      <Text className="text-lg font-bold">{title}</Text>
      {children}
    </View>
  )
}
export function ReportAmount({
  label,
  amount,
  currency,
  onPress,
}: { label: string; amount: string; currency: string; onPress?: () => void }) {
  const content = (
    <>
      <Text className="flex-1 text-sm">{label}</Text>
      <Text className="flex-1 text-right text-sm font-semibold">
        {formatFinanceMoney(amount, currency)}
      </Text>
    </>
  )
  // The chevron sits beside the wrapping label and amount so it never drops
  // onto a line of its own, and stays out of the spoken label.
  return onPress ? (
    <Pressable
      haptic
      accessibilityRole="button"
      accessibilityLabel={`View ${label} account entries`}
      className="min-h-12 flex-row items-center gap-2 border-b border-dotted border-border py-3"
      onPress={onPress}
    >
      <View className="flex-1 flex-row flex-wrap items-center gap-3">
        {content}
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  ) : (
    <View className="flex-row flex-wrap gap-3 border-b border-dotted border-border py-3">
      {content}
    </View>
  )
}
