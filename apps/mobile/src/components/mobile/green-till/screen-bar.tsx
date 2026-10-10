import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import type { ReactNode } from "react"

/**
 * Green Till screen bar: round close (X) or back (‹) button on the left, a
 * centred title, and a matching 44pt slot on the right.
 */
export function ScreenBar({
  kind = "close",
  label,
  onPress,
  title,
  trailing,
}: {
  kind?: "close" | "back"
  label: string
  onPress: () => void
  title: string
  trailing?: ReactNode
}) {
  const colors = useColors()
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="rounded-full bg-card shadow-sm">
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full active:opacity-80"
          haptic
          onPress={onPress}
          transition
        >
          <Icon
            className={kind === "back" ? "size-[20px]" : "size-[18px]"}
            color={colors.foreground}
            name={kind === "back" ? "ChevronLeft" : "X"}
          />
        </Pressable>
      </View>
      <Text
        accessibilityRole="header"
        className="min-w-0 flex-1 text-center text-base font-extrabold tracking-tight text-foreground"
        numberOfLines={1}
      >
        {title}
      </Text>
      {trailing ?? <View className="size-11" />}
    </View>
  )
}
