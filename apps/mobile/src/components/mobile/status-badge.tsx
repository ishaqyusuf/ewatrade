import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { cn } from "@/lib/utils"
import { View } from "react-native"

const statusBadgeContainerClasses: Record<MobileDesignStatusTone, string> = {
  default: "border-border bg-card",
  destructive: "border-destructive/30 bg-destructive/10",
  muted: "border-border bg-muted",
  primary: "border-primary/30 bg-primary/10",
  success: "border-success/30 bg-success/10",
  warning: "border-warn/30 bg-warn/10",
}

const statusBadgeTextClasses: Record<MobileDesignStatusTone, string> = {
  default: "text-foreground",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warn",
}

type StatusBadgeProps = {
  className?: string
  icon?: IconKeys
  label: string
  tone?: MobileDesignStatusTone
}

export function StatusBadge({
  className,
  icon,
  label,
  tone = "default",
}: StatusBadgeProps) {
  const containerClassName = statusBadgeContainerClasses[tone]
  const textClassName = statusBadgeTextClasses[tone]

  return (
    <View
      accessibilityLabel={label}
      className={cn(
        "min-h-8 flex-row items-center gap-1.5 rounded-full border px-3 py-1",
        containerClassName,
        className,
      )}
    >
      {icon ? (
        <Icon className={cn("size-sm", textClassName)} name={icon} />
      ) : null}
      <Text className={cn("text-xs font-semibold", textClassName)}>
        {label}
      </Text>
    </View>
  )
}
