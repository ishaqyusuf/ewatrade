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
    <View className="gap-3 border-t border-border pt-5">
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
  return onPress ? (
    <Pressable
      haptic
      accessibilityRole="button"
      accessibilityLabel={`View ${label} account entries`}
      className="min-h-12 flex-row flex-wrap items-center gap-3 border-b border-border py-3"
      onPress={onPress}
    >
      {content}
    </Pressable>
  ) : (
    <View className="flex-row flex-wrap gap-3 border-b border-border py-3">
      {content}
    </View>
  )
}
