import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
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
export type HistoryDot = "ok" | "warn" | "danger" | "muted"

const HISTORY_DOT: Record<HistoryDot, string> = {
  ok: "border-primary",
  warn: "border-gold",
  danger: "border-destructive",
  muted: "border-muted-foreground",
}

/**
 * Deep finance history card (Workshop 22, 01 Green Till Ledger): a rail of
 * toned rings, newest first, with each entry's amount on the right. A muted
 * entry (reversed or superseded) keeps its text but strikes the amount.
 */
export function HistoryTimeline({
  heading = "History",
  items,
}: {
  heading?: string
  items: Array<{
    id: string
    title: string
    detail: string
    amount?: string
    dot?: HistoryDot
    status?: string
    tone?: StatusPillTone
    /** A correction that belongs to this entry, drawn as a text link. */
    action?: {
      label: string
      accessibilityLabel?: string
      onPress: () => void
    }
  }>
}) {
  return (
    <View>
      <SectionHeader title={heading} />
      <View className="rounded-[20px] bg-card px-3.5 pt-3.5 shadow-sm">
        {items.map((item, index) => {
          const muted = item.dot === "muted"
          return (
            <View key={item.id} className="flex-row gap-2.5">
              <View className="w-4 items-center">
                <View
                  className={cn(
                    "mt-1 size-2.5 rounded-full border-[2.5px] bg-card",
                    HISTORY_DOT[item.dot ?? "ok"],
                  )}
                />
                {index < items.length - 1 ? (
                  <View className="mt-1 w-[1.5px] flex-1 bg-border" />
                ) : null}
              </View>
              <View className="min-w-0 flex-1 gap-0.5 pb-3.5">
                <Text className="text-sm font-bold text-foreground">
                  {item.title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {item.detail}
                </Text>
                {item.status ? (
                  <View className="mt-1 flex-row">
                    <StatusPill
                      label={item.status}
                      tone={item.tone ?? "muted"}
                    />
                  </View>
                ) : null}
                {item.action ? (
                  <Pressable
                    accessibilityLabel={item.action.accessibilityLabel}
                    accessibilityRole="button"
                    className="min-h-9 justify-center self-start"
                    hitSlop={6}
                    onPress={item.action.onPress}
                  >
                    <Text className="text-xs font-bold text-primary">
                      {item.action.label}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {item.amount ? (
                <Text
                  className={cn(
                    "max-w-[45%] text-right text-[13.5px] font-extrabold tabular-nums",
                    muted
                      ? "text-muted-foreground line-through"
                      : "text-foreground",
                  )}
                >
                  {item.amount}
                </Text>
              ) : null}
            </View>
          )
        })}
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
