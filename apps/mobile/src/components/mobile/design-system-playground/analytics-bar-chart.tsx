import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import type { PlaygroundChartDatum } from "./data"

type MobileAnalyticsBarChartProps = {
  data: PlaygroundChartDatum[]
  state?: "empty" | "error" | "loading" | "ready"
}

export function MobileAnalyticsBarChart({
  data,
  state = "ready",
}: MobileAnalyticsBarChartProps) {
  if (state === "loading") {
    return (
      <View
        className="gap-3 rounded-2xl bg-card p-4"
        testID="chart-loading-state"
      >
        <View className="h-4 w-32 rounded-full bg-muted" />
        <View className="flex-row items-end gap-3">
          {data.map((item) => (
            <View className="min-w-0 flex-1 gap-2" key={item.label}>
              <View className="h-16 rounded-t-2xl bg-muted" />
              <View className="h-3 rounded-full bg-muted" />
            </View>
          ))}
        </View>
      </View>
    )
  }

  if (state === "empty") {
    return (
      <EmptyState
        className="bg-card"
        icon="BarChart3"
        message="Sales, link, and inventory bars appear here after activity is recorded."
        title="No chart data yet"
      />
    )
  }

  if (state === "error") {
    return (
      <StatusBanner
        icon="TriangleAlert"
        message="The chart could not be prepared from the sample report state."
        title="Chart error state"
        tone="destructive"
      />
    )
  }

  return (
    <View
      className="gap-4 rounded-2xl bg-card p-4"
      testID="mobile-analytics-bar-chart"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">
            MobileAnalyticsBarChart
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            Theme-aware bars use semantic token classes and fixed mobile heights.
          </Text>
        </View>
        <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
          Weekly
        </Text>
      </View>

      <View className="min-h-32 flex-row items-end gap-3">
        {data.map((item) => (
          <View className="min-w-0 flex-1 items-center gap-2" key={item.label}>
            <View
              accessibilityLabel={`${item.label} ${item.value}`}
              className={cn(
                "w-full rounded-t-2xl",
                item.barClassName,
                item.toneClassName,
              )}
            />
            <Text className="text-xs font-bold text-muted-foreground">
              {item.label}
            </Text>
          </View>
        ))}
      </View>

      <View
        className="flex-row flex-wrap items-center gap-3 pt-3"
        testID="chart-legend"
      >
        <LegendDot className="bg-primary" label="Sales" />
        <LegendDot className="bg-success" label="Stock" />
        <LegendDot className="bg-warn" label="Attention" />
      </View>

      <View className="hidden" testID="chart-empty-state" />
      <View className="hidden" testID="chart-error-state" />
    </View>
  )
}

function LegendDot({
  className,
  label,
}: {
  className: string
  label: string
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn("size-2.5 rounded-full", className)} />
      <Text className="text-xs font-semibold text-muted-foreground">
        {label}
      </Text>
    </View>
  )
}
