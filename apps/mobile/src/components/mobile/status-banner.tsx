import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { View } from "react-native"

const statusBannerContainerClasses: Record<MobileDesignStatusTone, string> = {
  default: "border-border bg-card",
  destructive: "border-destructive/30 bg-destructive/10",
  muted: "border-border bg-muted",
  primary: "border-primary/30 bg-primary/10",
  success: "border-success/30 bg-success/10",
  warning: "border-warn/30 bg-warn/10",
}

const statusBannerTextClasses: Record<MobileDesignStatusTone, string> = {
  default: "text-foreground",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warn",
}

type StatusBannerProps = {
  actionLabel?: string
  children?: ReactNode
  className?: string
  icon?: IconKeys
  message: string
  onActionPress?: () => void
  title?: string
  tone?: MobileDesignStatusTone
}

export function StatusBanner({
  actionLabel,
  children,
  className,
  icon,
  message,
  onActionPress,
  title,
  tone = "default",
}: StatusBannerProps) {
  const containerClassName = statusBannerContainerClasses[tone]
  const textClassName = statusBannerTextClasses[tone]

  return (
    <View
      accessibilityLabel={[title, message].filter(Boolean).join(". ")}
      className={cn("rounded-2xl border p-4", containerClassName, className)}
    >
      <View className="flex-row gap-3">
        {icon ? (
          <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-card/80">
            <Icon className={cn("size-base", textClassName)} name={icon} />
          </View>
        ) : null}
        <View className="min-w-0 flex-1 gap-1">
          {title ? (
            <Text className="text-sm font-semibold text-foreground">
              {title}
            </Text>
          ) : null}
          <Text className="text-sm leading-5 text-muted-foreground">
            {message}
          </Text>
          {children}
        </View>
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          className="mt-3 min-h-11 items-center justify-center rounded-xl bg-card px-4"
          haptic
          onPress={onActionPress}
          transition
        >
          <Text className={cn("text-sm font-semibold", textClassName)}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
