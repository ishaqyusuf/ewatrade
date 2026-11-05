import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export type BulkOutcome = {
  key: string
  label: string
  /** "done" with what happened, or "skipped" with the reason. */
  result: "done" | "skipped"
  detail: string
}

/** One row per selected record after a bulk action: what ran, what was skipped and why. */
export function BulkReportList({ outcomes }: { outcomes: BulkOutcome[] }) {
  return (
    <View className="overflow-hidden rounded-[20px] bg-muted">
      {outcomes.map((outcome, index) => (
        <View
          key={outcome.key}
          className={
            index
              ? "flex-row gap-3 border-t border-border px-3.5 py-3"
              : "flex-row gap-3 px-3.5 py-3"
          }
        >
          <Icon
            className={
              outcome.result === "done"
                ? "size-[20px] text-primary"
                : "size-[20px] text-muted-foreground"
            }
            name={outcome.result === "done" ? "CheckCircle2" : "Ban"}
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-sm font-bold text-foreground">
              {outcome.label}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {outcome.result === "done"
                ? outcome.detail
                : `Skipped · ${outcome.detail}`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}
