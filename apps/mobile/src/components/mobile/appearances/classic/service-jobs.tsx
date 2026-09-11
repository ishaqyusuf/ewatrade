import { StatusBadge } from "@/components/mobile/status-badge"
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
import {
  textLabel,
  statusTone,
} from "@/components/mobile/service-jobs/service-jobs-model"
import { cn } from "@/lib/utils"

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.orderNumber}, ${textLabel(job.summary)}`}
      className="gap-3 border-b border-border py-4"
      haptic
      onPress={onPress}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-bold text-foreground">{job.orderNumber}</Text>
          <Text className="text-xs text-muted-foreground">
            {job.lines.map((line) => line.catalogItemName).join(", ")}
          </Text>
        </View>
        <StatusBadge
          label={textLabel(job.summary)}
          tone={statusTone(job.summary)}
        />
      </View>
      <Text className="text-xs text-muted-foreground">
        {job.priority === "urgent"
          ? "Urgent"
          : job.currentAssigneeUserId
            ? "Assigned"
            : "Unassigned"}
      </Text>
    </Pressable>
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
        role !== "checkbox" && (selected
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
