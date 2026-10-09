import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import type { ReactNode } from "react"
import { View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import {
  SectionHeader,
  StatusPill,
  type StatusPillTone,
} from "../green-till/kit"

export function FinanceDetailScaffold({
  title,
  label,
  amount,
  sub,
  stats,
  loading,
  children,
}: {
  title: string
  label: string
  amount?: string
  sub?: string
  stats?: Array<{ label: string; value: string }>
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <View className="gap-4">
      <Text
        accessibilityRole="header"
        className="text-xl font-extrabold text-foreground"
      >
        {title}
      </Text>
      {loading ? (
        <Skeleton className="h-48 rounded-[22px]" />
      ) : (
        <HeroCard
          label={label}
          amount={amount ?? "—"}
          sub={sub}
          stats={stats}
        />
      )}
      {children}
    </View>
  )
}
export function HistoryTimeline({
  items,
}: {
  items: Array<{
    id: string
    title: string
    detail: string
    status?: string
    tone?: StatusPillTone
  }>
}) {
  return (
    <View>
      <SectionHeader title="History" />
      <View className="rounded-[20px] bg-card px-4">
        {items.map((item) => (
          <View
            key={item.id}
            className="flex-row gap-3 border-b border-border py-4"
          >
            <View className="mt-1 size-2.5 rounded-full bg-primary" />
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-sm font-bold text-foreground">
                {item.title}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {item.detail}
              </Text>
              {item.status ? (
                <StatusPill label={item.status} tone={item.tone ?? "muted"} />
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}
export function FinanceChoice({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string
  selected: boolean
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={
        selected
          ? "min-h-12 flex-row items-center gap-3 rounded-[14px] border border-primary bg-tint-mint px-4 py-3"
          : "min-h-12 flex-row items-center gap-3 rounded-[14px] border border-border bg-card px-4 py-3"
      }
    >
      <Icon
        name={selected ? "CircleCheck" : "Square"}
        className="size-[20px] text-primary"
      />
      <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
        {label}
      </Text>
    </Pressable>
  )
}
