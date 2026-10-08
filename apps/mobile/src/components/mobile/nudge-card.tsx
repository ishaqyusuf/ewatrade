import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { ReactNode } from "react"

export function NudgeCard({
  title,
  children,
}: { title: string; children: ReactNode }) {
  return (
    <View className="mx-4 gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="text-base font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  )
}
