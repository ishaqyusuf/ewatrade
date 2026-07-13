import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { View } from "react-native"

const timelineContainerClasses: Record<MobileDesignStatusTone, string> = {
  default: "border-border bg-card",
  destructive: "border-destructive/30 bg-destructive/10",
  muted: "border-border bg-muted",
  primary: "border-primary/30 bg-primary/10",
  success: "border-success/30 bg-success/10",
  warning: "border-warn/30 bg-warn/10",
}

const timelineTextClasses: Record<MobileDesignStatusTone, string> = {
  default: "text-foreground",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warn",
}

type TimelineRowProps = {
  children?: ReactNode
  className?: string
  detail?: string
  icon?: IconKeys
  isLast?: boolean
  meta?: string
  title: string
  tone?: MobileDesignStatusTone
}

export function TimelineRow({
  children,
  className,
  detail,
  icon = "CircleCheck",
  isLast = false,
  meta,
  title,
  tone = "default",
}: TimelineRowProps) {
  const containerClassName = timelineContainerClasses[tone]
  const textClassName = timelineTextClasses[tone]

  return (
    <View className={cn("flex-row gap-3", className)}>
      <View className="items-center">
        <View
          className={cn(
            "h-9 w-9 items-center justify-center rounded-full border",
            containerClassName,
          )}
        >
          <Icon className={cn("size-sm", textClassName)} name={icon} />
        </View>
        {!isLast ? <View className="w-px flex-1 bg-border" /> : null}
      </View>
      <View className="min-w-0 flex-1 pb-5">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {title}
          </Text>
          {meta ? (
            <Text className="text-xs text-muted-foreground">{meta}</Text>
          ) : null}
        </View>
        {detail ? (
          <Text className="mt-1 text-sm leading-5 text-muted-foreground">
            {detail}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  )
}
