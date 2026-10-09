import {
  statusTone,
  textLabel,
} from "@/components/mobile/service-jobs/service-jobs-model"
import type {
  ServiceChoiceProps,
  ServiceHeaderProps,
  ServiceJobRowProps,
  ServiceSectionProps,
} from "@/components/mobile/service-jobs/service-jobs-presentation"
import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { ListCard, RecordRow, StatusPill } from "../../green-till/kit"
import {
  overdueWork,
  workStatusLabel,
} from "../../service-jobs/service-work-summary"

export function ServiceHeader({
  mode,
  title,
  description,
  meta,
}: ServiceHeaderProps) {
  return (
    <View className="gap-1">
      {mode !== "queue" ? (
        <Text
          accessibilityRole="header"
          className="text-xl font-extrabold text-foreground"
        >
          {title}
        </Text>
      ) : null}
      <Text className="text-sm text-muted-foreground [-rn-line-height:20]">
        {description}
      </Text>
      {meta ? (
        <Text className="text-xs text-muted-foreground">{meta}</Text>
      ) : null}
    </View>
  )
}
export function ServiceJobRow({ job, onPress }: ServiceJobRowProps) {
  const late = overdueWork(job, Date.now())
  return (
    <ListCard>
      <RecordRow
        stackDetails
        title={job.customerName || "Walk-in customer"}
        meta={`${job.orderNumber} · ${job.lines.map((line) => line.catalogItemName).join(", ")}${job.dueCommitmentAt ? ` · Due ${new Date(job.dueCommitmentAt).toLocaleString()}` : " · No due time"}`}
        avatar={{
          icon: "Wrench",
          tint: late || job.summary === "blocked" ? "rose" : "sky",
        }}
        status={
          <StatusPill
            label={late ? "Overdue" : workStatusLabel(job.summary)}
            tone={
              late || job.summary === "blocked"
                ? "danger"
                : job.summary === "ready_for_handoff"
                  ? "ok"
                  : "info"
            }
          />
        }
        onPress={onPress}
      />
    </ListCard>
  )
}
export function ServiceSection({
  title,
  description,
  children,
}: ServiceSectionProps) {
  return (
    <View className="gap-4 border-y border-border py-4">
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-bold text-foreground">
          {title}
        </Text>
        {description ? (
          <Text className="text-xs text-muted-foreground [-rn-line-height:20]">
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
        role === "checkbox"
          ? "min-h-11 flex-row items-center justify-between gap-3 border-b border-border py-4"
          : "min-h-12 flex-row items-center gap-3 rounded-xl border px-4 py-3",
        role !== "checkbox" &&
          (selected
            ? "border-primary bg-primary/5"
            : "border-border bg-background"),
        disabled && "opacity-50",
      )}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-bold text-foreground [-rn-include-font-padding:false]">
          {title}
        </Text>
        {description ? (
          <Text className="text-xs text-muted-foreground [-rn-line-height:18]">
            {description}
          </Text>
        ) : null}
      </View>
      <Icon
        name={selected ? "CircleCheck" : "Square"}
        className={cn(
          "size-sm",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      />
    </Pressable>
  )
}
