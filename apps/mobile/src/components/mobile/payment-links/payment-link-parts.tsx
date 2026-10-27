import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { Fragment } from "react"

export type Fact = {
  label: string
  value: string
  /** Money and counts: tabular figures. */
  numeric?: boolean
  strong?: boolean
}

/** A quiet card of label/value lines (read-only, so the card owns padding). */
export function FactCard({ facts }: { facts: Fact[] }) {
  const largeText = useLargeTextLayout()
  return (
    <View className="rounded-[20px] bg-card px-3.5 py-1 shadow-sm">
      {facts.map((fact, index) => (
        <Fragment key={fact.label}>
          {index > 0 ? <View className="h-px bg-border" /> : null}
          <View
            className={cn(
              "min-h-12 gap-x-3 py-2.5",
              largeText ? "gap-y-0.5" : "flex-row items-center",
            )}
          >
            <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
              {fact.label}
            </Text>
            <Text
              className={cn(
                "text-sm text-foreground",
                !largeText && "max-w-[62%] text-right",
                fact.strong ? "font-extrabold" : "font-semibold",
                fact.numeric && "tabular-nums",
              )}
              selectable
            >
              {fact.value}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  )
}

/** One-line hint with an info icon, as in Money accounts. */
export function InfoNote({ children }: { children: string }) {
  const colors = useColors()
  return (
    <View className="flex-row gap-2 px-0.5">
      <Icon
        className="mt-0.5 size-[14px]"
        color={colors.mutedForeground}
        name="Info"
      />
      <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
        {children}
      </Text>
    </View>
  )
}
