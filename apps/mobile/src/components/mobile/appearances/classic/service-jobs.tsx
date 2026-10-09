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
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { Text as NativeText } from "react-native"
import {
  RowDivider,
  StatusPill,
  type StatusPillTone,
} from "../../green-till/kit"
import { overdueWork } from "../../service-jobs/service-work-summary"

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
/** "14:00" today, "Tomorrow", a weekday this week, else "12 Oct". */
export function workDueLabel(due: Date | string | null, now = new Date()) {
  if (!due) return null
  const at = new Date(due)
  const day = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((day(at) - day(now)) / 86_400_000)
  if (days === 0)
    return at.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })
  if (days === 1) return "Tomorrow"
  if (days === -1) return "Yesterday"
  if (days > 1 && days < 7)
    return at.toLocaleDateString("en-GB", { weekday: "short" })
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function workQueueStatus(summary: string): {
  label: string
  tint: GreenTillTint
  tone: StatusPillTone
} {
  if (summary === "ready_for_handoff")
    return { label: "Ready to collect", tint: "mint", tone: "ok" }
  if (summary === "in_progress" || summary === "partially_ready")
    return {
      label: summary === "in_progress" ? "In progress" : "Part ready",
      tint: "sky",
      tone: "info",
    }
  if (summary === "blocked")
    return { label: "Blocked", tint: "rose", tone: "danger" }
  if (summary === "completed")
    return { label: "Collected", tint: "mint", tone: "muted" }
  if (summary === "cancelled")
    return { label: "Cancelled", tint: "lilac", tone: "muted" }
  return { label: "Queued", tint: "amber", tone: "muted" }
}

export function ServiceJobRow({
  job,
  onPress,
  first = true,
  last = true,
}: ServiceJobRowProps) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const large = useLargeTextLayout()
  const late = overdueWork(job, Date.now())
  const status = workQueueStatus(job.summary)
  const name = job.customerName || "Walk-in customer"
  const due = workDueLabel(job.dueCommitmentAt)
  const tint = late ? "rose" : status.tint
  const services = job.lines.map((line) => line.catalogItemName).join(", ")
  return (
    <View
      className={cn(
        "overflow-hidden bg-card",
        first && "rounded-t-[20px]",
        last && "rounded-b-[20px]",
      )}
    >
      <Pressable
        accessibilityLabel={`${name}, ${services}, ${job.orderNumber}, ${status.label}${due ? `, due ${due}` : ""}${late ? ", overdue" : ""}`}
        accessibilityRole="button"
        className="min-h-[62px] flex-row items-center gap-3 px-3.5 py-3 active:opacity-80"
        haptic
        onPress={onPress}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette[tint],
            borderRadius: 19,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <NativeText
            maxFontSizeMultiplier={1.3}
            style={{
              color: palette[`${tint}Foreground`],
              fontSize: 13,
              fontWeight: "800",
            }}
          >
            {initials(name)}
          </NativeText>
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-sm font-bold [-rn-line-height:19] text-foreground"
            numberOfLines={large ? undefined : 1}
          >
            {name}
          </Text>
          <Text
            className="text-xs [-rn-line-height:17] text-muted-foreground"
            numberOfLines={large ? undefined : 1}
          >
            {job.priority === "urgent" ? "Urgent · " : ""}
            {services} · {job.orderNumber}
          </Text>
        </View>
        <View className="items-end">
          {due ? (
            <Text
              className={cn(
                "text-xs font-bold tabular-nums",
                late ? "text-destructive" : "text-foreground",
              )}
            >
              {due}
            </Text>
          ) : null}
          <StatusPill label={status.label} tone={status.tone} />
        </View>
      </Pressable>
      {last ? null : <RowDivider />}
    </View>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
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
