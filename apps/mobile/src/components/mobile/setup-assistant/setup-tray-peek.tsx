import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"

/** Dark tray above the composer: list icon with a gold count, then Review. */
export function SetupTrayPeek({
  counts,
  onPress,
}: {
  counts: { open: number; confirmed: number; check: number }
  onPress: () => void
}) {
  const large = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open setup list, ${counts.open} records to review`}
      className="min-h-[52px] flex-row items-center gap-2.5 rounded-[18px] bg-ink py-2 pl-2.5 pr-2"
      onPress={onPress}
    >
      <View className="size-[34px] items-center justify-center rounded-[11px] bg-background/10">
        <Icon name="ClipboardList" className="size-[17px] text-background" />
        {counts.open ? (
          <View className="absolute -right-[11px] -top-2 h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-gold px-1">
            <Text className="text-[11px] font-extrabold text-gold-foreground">
              {counts.open}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="ml-1 min-w-0 flex-1">
        <Text className="text-[13.5px] font-bold text-background">
          Setup list
        </Text>
        <Text
          className="text-[11.5px] text-background/70"
          numberOfLines={large ? undefined : 1}
        >
          {counts.confirmed} confirmed · {counts.check} to check
        </Text>
      </View>
      <View className="h-[34px] flex-row items-center gap-1 rounded-[11px] bg-gold px-3">
        {large ? null : (
          <Text className="text-[12.5px] font-extrabold text-gold-foreground">
            Review
          </Text>
        )}
        <Icon
          className="size-[14px]"
          color={palette.goldForeground}
          name="ChevronUp"
        />
      </View>
    </Pressable>
  )
}
