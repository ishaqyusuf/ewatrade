import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type {
  ServiceHeaderProps,
  ServiceJobRowProps,
  ServiceSectionProps,
  ServiceChoiceProps,
} from "@/components/mobile/service-jobs/service-jobs-presentation"
import { textLabel } from "@/components/mobile/service-jobs/service-jobs-model"
import { cn } from "@/lib/utils"

export function ServiceHeader({
  title,
  description,
  meta,
}: ServiceHeaderProps) {
  return (
    <View className="gap-3 rounded-[24px] border-b-[5px] border-market-marigold bg-market-palm px-5 py-6">
      <Text className="font-market-mono text-[10px] uppercase tracking-[1.3px] text-market-on-palm-muted">
        Workroom ledger
      </Text>
      <Text
        accessibilityRole="header"
        className="font-market-display text-[36px] font-bold text-market-on-palm [-rn-line-height:41]"
      >
        {title}
      </Text>
      <Text className="text-sm text-market-on-palm-muted [-rn-line-height:21]">
        {description}
      </Text>
      {meta ? (
        <Text className="border-t border-market-hero-hairline pt-3 font-market-mono text-xs text-market-on-palm">
          {meta}
        </Text>
      ) : null}
    </View>
  )
}
export function ServiceJobRow({ job, onPress }: ServiceJobRowProps) {
  const ready =
    job.summary === "ready_for_handoff" || job.summary === "partially_ready"
  const blocked = job.summary === "blocked"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.orderNumber}, ${textLabel(job.summary)}`}
      onPress={onPress}
      haptic
      className="my-1.5 gap-3 rounded-[18px] border border-market-line bg-market-field p-4 active:bg-market-canvas"
    >
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <Text className="min-w-0 shrink font-market-mono text-base font-bold text-market-ink">
          {job.orderNumber}
        </Text>
        <View
          className={cn(
            "max-w-full rounded-lg px-2 py-1",
            ready
              ? "bg-market-palm"
              : blocked
                ? "bg-market-marigold"
                : "bg-market-canvas",
          )}
        >
          <Text
            className={cn(
              "text-xs font-bold capitalize [-rn-include-font-padding:false]",
              ready
                ? "text-market-on-palm"
                : blocked
                  ? "text-market-on-marigold"
                  : "text-market-ink",
            )}
          >
            {textLabel(job.summary)}
          </Text>
        </View>
      </View>
      <Text className="text-sm text-market-muted-ink [-rn-line-height:20]">
        {job.lines.map((line) => line.catalogItemName).join(", ")}
      </Text>
      <View className="flex-row items-center justify-between gap-3 border-t border-market-line pt-3">
        <Text className="min-w-0 flex-1 text-xs font-semibold text-market-muted-ink">
          {job.priority === "urgent"
            ? "Urgent"
            : job.currentAssigneeUserId
              ? "Assigned"
              : "Unassigned"}{" "}
          · Tracked work
        </Text>
        <Icon name="ChevronRight" className="size-sm text-market-accent-ink" />
      </View>
    </Pressable>
  )
}
export function ServiceSection({
  title,
  description,
  children,
}: ServiceSectionProps) {
  return (
    <View className="gap-4">
      <View className="gap-1 border-l-[3px] border-market-marigold pl-3">
        <Text
          accessibilityRole="header"
          className="text-base font-extrabold text-market-ink"
        >
          {title}
        </Text>
        {description ? (
          <Text className="text-xs text-market-muted-ink [-rn-line-height:20]">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}
export function ServiceChoice({
  title,
  description,
  selected,
  disabled,
  onPress,
  role = "radio",
}: ServiceChoiceProps) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={title}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic={!disabled}
      className={cn(
        "min-h-14 flex-row items-center gap-3 rounded-2xl border px-4 py-3",
        selected
          ? "border-market-accent-ink bg-market-field"
          : "border-market-line bg-market-canvas",
        disabled && "opacity-45",
      )}
    >
      <View
        className={cn(
          "size-9 items-center justify-center rounded-lg",
          selected ? "bg-market-palm" : "bg-market-marigold",
        )}
      >
        <Icon
          name={selected ? "CircleCheck" : "ClipboardList"}
          className={cn(
            "size-sm",
            selected ? "text-market-on-palm" : "text-market-on-marigold",
          )}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-bold text-market-ink [-rn-include-font-padding:false]">
          {title}
        </Text>
        {description ? (
          <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}
