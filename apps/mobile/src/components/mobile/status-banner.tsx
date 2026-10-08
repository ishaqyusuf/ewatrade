import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

// Green Till banners: tinted, rounded-16, text in the tint's own colour.
const statusBannerContainerClasses: Record<MobileDesignStatusTone, string> = {
  default: "bg-card shadow-sm",
  destructive: "bg-tint-rose",
  muted: "bg-muted",
  primary: "bg-tint-sky",
  success: "bg-tint-mint",
  warning: "bg-tint-amber",
}

const statusBannerTextClasses: Record<MobileDesignStatusTone, string> = {
  default: "text-foreground",
  destructive: "text-tint-rose-foreground",
  muted: "text-muted-foreground",
  primary: "text-tint-sky-foreground",
  success: "text-tint-mint-foreground",
  warning: "text-tint-amber-foreground",
}

type StatusBannerProps = {
  actionDisabled?: boolean
  actionLabel?: string
  children?: ReactNode
  className?: string
  icon?: IconKeys
  /** A short trailing text link, such as "View". */
  linkLabel?: string
  message: string
  onActionPress?: () => void
  onLinkPress?: () => void
  title?: string
  tone?: MobileDesignStatusTone
}

export function StatusBanner({
  actionDisabled,
  actionLabel,
  children,
  className,
  icon,
  linkLabel,
  message,
  onActionPress,
  onLinkPress,
  title,
  tone = "default",
}: StatusBannerProps) {
  const containerClassName = statusBannerContainerClasses[tone]
  const textClassName = statusBannerTextClasses[tone]

  return (
    <View
      accessibilityLabel={[title, message].filter(Boolean).join(". ")}
      className={cn("rounded-2xl px-3.5 py-3", containerClassName, className)}
    >
      <View className="flex-row items-start gap-2.5">
        {icon ? (
          <Icon
            className={cn("mt-0.5 size-[18px]", textClassName)}
            name={icon}
          />
        ) : null}
        <View className="min-w-0 flex-1 gap-0.5">
          {title ? (
            <Text
              className={cn(
                "text-[13.5px] font-bold [-rn-line-height:19]",
                textClassName,
              )}
            >
              {title}
            </Text>
          ) : null}
          <Text
            className={cn(
              "text-[13px] [-rn-line-height:18]",
              tone === "default" ? "text-muted-foreground" : textClassName,
            )}
          >
            {message}
          </Text>
          {children}
        </View>
        {linkLabel && onLinkPress ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-9 justify-center self-center pl-1"
            haptic
            hitSlop={6}
            onPress={onLinkPress}
          >
            <Text className={cn("text-[13px] font-extrabold", textClassName)}>
              {linkLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          className="mt-3 min-h-11 items-center justify-center rounded-xl bg-card px-4"
          disabled={actionDisabled}
          haptic
          onPress={onActionPress}
          transition
        >
          <Text className={cn("text-sm font-bold", textClassName)}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
