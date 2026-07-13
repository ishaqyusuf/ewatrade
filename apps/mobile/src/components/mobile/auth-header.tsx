import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { View } from "react-native"

type AuthHeaderProps = {
  align?: "center" | "start"
  badge?: string
  icon?: IconKeys
  subtitle: string
  title: string
}

export function AuthHeader({
  align = "start",
  badge,
  icon = "Building2",
  subtitle,
  title,
}: AuthHeaderProps) {
  const isCentered = align === "center"

  return (
    <View className={cn("gap-5", isCentered && "items-center")}>
      <View
        className={cn(
          "flex-row items-center gap-3",
          isCentered ? "justify-center" : "justify-between",
        )}
      >
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="size-lg text-primary" name={icon} />
        </View>
        {badge ? (
          <View className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
            <Text className="text-xs font-bold text-primary">{badge}</Text>
          </View>
        ) : null}
      </View>
      <View className={cn("gap-2", isCentered && "items-center")}>
        <Text
          className={cn(
            "text-3xl font-bold text-foreground",
            isCentered && "text-center",
          )}
        >
          {title}
        </Text>
        <Text
          className={cn(
            "text-base leading-6 text-muted-foreground",
            isCentered && "text-center",
          )}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  )
}

type AuthMethodButtonProps = {
  disabled?: boolean
  icon?: IconKeys
  label: string
  loadingLabel?: string
  onPress: () => void
  pending?: boolean
  tone?: "primary" | "subtle"
}

export function AuthMethodButton({
  disabled,
  icon = "Globe",
  label,
  loadingLabel,
  onPress,
  pending,
  tone = "subtle",
}: AuthMethodButtonProps) {
  return (
    <Pressable
      className={cn(
        "rounded-2xl border",
        tone === "primary"
          ? "border-primary/30 bg-primary/10"
          : "border-border bg-card",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <View
        className={cn(
          "min-h-14 flex-row items-center gap-3 rounded-2xl px-4",
          disabled && "opacity-50",
        )}
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-background">
          <Icon
            className={cn(
              "size-base",
              tone === "primary" ? "text-primary" : "text-foreground",
            )}
            name={icon}
          />
        </View>
        <Text
          className={cn(
            "flex-1 text-base font-bold",
            tone === "primary" ? "text-primary" : "text-foreground",
          )}
          numberOfLines={1}
        >
          {pending && loadingLabel ? loadingLabel : label}
        </Text>
      </View>
    </Pressable>
  )
}
