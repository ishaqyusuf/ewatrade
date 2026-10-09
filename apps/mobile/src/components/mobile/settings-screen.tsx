import { Skeleton } from "@/components/ui/skeleton"
import type { ReactNode } from "react"
import { View } from "react-native"
import { HeroCard } from "./green-till/hero-card"
/** Shared answer and content body; routes retain their scroll, sheet and navigation. */
export function SettingsScreen({
  title,
  sub,
  loading,
  children,
}: { title: string; sub?: string; loading?: boolean; children?: ReactNode }) {
  return (
    <View className="gap-4">
      {loading ? (
        <Skeleton className="h-36 rounded-[22px]" />
      ) : (
        <HeroCard title={title} sub={sub} />
      )}
      {children}
    </View>
  )
}
