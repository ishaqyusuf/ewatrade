import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"

export function FloatingActionRow({
  label,
  detail,
  icon,
  disabled,
  emphasis = "standard",
  statusLabel,
  onPress,
}: {
  label: string
  detail?: string
  icon: IconKeys
  disabled?: boolean
  emphasis?: "catalog" | "standard"
  statusLabel?: string
  onPress(): void
}) {
  const largeTextLayout = useLargeTextLayout()
  const highlighted = emphasis === "catalog" && !disabled
  return (
    <Pressable
      accessibilityHint={detail}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "-mx-2 min-h-16 flex-row gap-3 border-t border-border px-3 py-3",
        largeTextLayout ? "items-start" : "items-center",
        highlighted && "bg-primary/5 active:bg-primary/10",
        !disabled && !highlighted && "active:bg-accent",
        disabled && !statusLabel && "opacity-50",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <View
        className={cn(
          "size-10 items-center justify-center rounded-full",
          largeTextLayout && "mt-1",
          highlighted ? "bg-primary" : "bg-muted",
        )}
      >
        <Icon
          className={cn(
            "size-sm",
            highlighted ? "text-primary-foreground" : "text-muted-foreground",
          )}
          name={icon}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{label}</Text>
        {detail ? (
          <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
            {detail}
          </Text>
        ) : null}
      </View>
      {disabled && statusLabel ? (
        <StatusBadge
          className={largeTextLayout ? "mt-1" : undefined}
          label={statusLabel}
          tone="warning"
        />
      ) : (
        <Icon
          className={cn(
            "size-sm text-muted-foreground",
            largeTextLayout && "mt-1",
          )}
          name="ChevronRight"
        />
      )}
    </Pressable>
  )
}
