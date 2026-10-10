import { Skeleton } from "@/components/ui/skeleton"
import type { ComponentProps, ReactNode } from "react"
import { View } from "react-native"
import { HeroCard } from "./green-till/hero-card"

type HeroProps = ComponentProps<typeof HeroCard>

/** Shared answer and content body; routes retain their scroll, sheet and navigation. */
export function SettingsScreen({
  title,
  sub,
  label,
  pill,
  stats,
  loading,
  children,
}: {
  title: string
  sub?: string
  label?: string
  pill?: HeroProps["pill"]
  stats?: HeroProps["stats"]
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <View className="gap-4">
      {loading ? (
        <Skeleton className="h-36 rounded-[22px]" />
      ) : (
        <HeroCard
          label={label}
          title={title}
          sub={sub}
          pill={pill}
          stats={stats}
        />
      )}
      {children}
    </View>
  )
}
