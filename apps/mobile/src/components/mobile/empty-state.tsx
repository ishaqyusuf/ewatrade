import { ActionButton } from "@/components/mobile/action-button"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import type { ComponentProps, ReactNode } from "react"
import { View } from "react-native"

type EmptyStateProps = {
  actionLabel?: string
  actionProps?: Omit<ComponentProps<typeof ActionButton>, "children">
  children?: ReactNode
  className?: string
  icon?: IconKeys
  message: string
  title: string
}

export function EmptyState({
  actionLabel,
  actionProps,
  children,
  className,
  icon = "Info",
  message,
  title,
}: EmptyStateProps) {
  const { className: actionClassName, ...buttonProps } = actionProps ?? {}

  return (
    <View
      className={cn(
        "items-center gap-4 rounded-2xl border border-border bg-card p-6",
        className,
      )}
    >
      <View className="h-14 w-14 items-center justify-center rounded-full bg-accent">
        <Icon className="size-lg text-accent-foreground" name={icon} />
      </View>
      <View className="items-center gap-2">
        <Text className="text-center text-lg font-bold text-foreground">
          {title}
        </Text>
        <Text className="text-center text-sm leading-5 text-muted-foreground">
          {message}
        </Text>
      </View>
      {children}
      {actionLabel ? (
        <ActionButton className={cn("mt-1", actionClassName)} {...buttonProps}>
          {actionLabel}
        </ActionButton>
      ) : null}
    </View>
  )
}
