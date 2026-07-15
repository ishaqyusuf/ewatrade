import { EmptyState } from "@/components/mobile/empty-state"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"

export type ReportTone = "danger" | "default" | "success" | "warning"

export type ReportRowItem = {
  detail?: string
  id: string
  label: string
  tone?: ReportTone
  value: string
}

type ReportMetricTileProps = {
  label: string
  tone?: ReportTone
  value: string
}

type ReportRecordRowProps = {
  item: ReportRowItem
}

type ReportSectionProps = {
  empty: string
  rows: ReportRowItem[]
  title: string
  visibleLimit?: number
}

const reportToneTextClasses: Record<ReportTone, string> = {
  danger: "text-destructive",
  default: "text-foreground",
  success: "text-success",
  warning: "text-warn",
}

export function ReportMetricTile({
  label,
  tone = "default",
  value,
}: ReportMetricTileProps) {
  return (
    <View variant="card" className="min-w-0 flex-1 gap-1 p-3">
      <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
        {label}
      </Text>
      <Text
        className={cn("text-lg font-extrabold", reportToneTextClasses[tone])}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}

export function ReportRecordRow({ item }: ReportRecordRowProps) {
  return (
    <View variant="muted" className="flex-row items-start justify-between gap-3 p-3">
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-semibold text-foreground">
          {item.label}
        </Text>
        {item.detail ? (
          <Text className="text-xs leading-4 text-muted-foreground">
            {item.detail}
          </Text>
        ) : null}
      </View>
      <Text
        className={cn(
          "max-w-[34%] text-right text-sm font-extrabold",
          reportToneTextClasses[item.tone ?? "default"],
        )}
      >
        {item.value}
      </Text>
    </View>
  )
}

export function ReportSection({
  empty,
  rows,
  title,
  visibleLimit = 8,
}: ReportSectionProps) {
  const visibleRows = rows.slice(0, visibleLimit)

  return (
    <View className="gap-3">
      <Text className="text-base font-extrabold text-foreground">{title}</Text>
      {rows.length > 0 ? (
        <View>
          {visibleRows.map((item) => (
            <ReportRecordRow item={item} key={item.id} />
          ))}
          {rows.length > visibleRows.length ? (
            <Text className="mt-2 text-xs font-semibold text-muted-foreground">
              Showing first {visibleRows.length} of {rows.length} rows.
            </Text>
          ) : null}
        </View>
      ) : (
        <EmptyState
          className="bg-background p-4"
          icon="Info"
          message={empty}
          title="Nothing to show"
        />
      )}
    </View>
  )
}
