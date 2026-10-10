import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"

export function SetupTrayPeek({
  counts,
  onPress,
}: {
  counts: { open: number; confirmed: number; check: number }
  onPress: () => void
}) {
  const large = useLargeTextLayout()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open setup list, ${counts.open} records to review`}
      className="min-h-[56px] flex-row items-center gap-3 rounded-[18px] bg-ink px-3 py-2"
      onPress={onPress}
    >
      <View className="size-[40px] items-center justify-center rounded-xl bg-gold">
        <Text className="text-sm font-bold text-gold-foreground">
          {counts.open}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-bold text-background">Setup list</Text>
        <Text className="text-xs text-background">
          {counts.confirmed} confirmed · {counts.check} to check
        </Text>
      </View>
      {large ? (
        <Icon name="ChevronUp" className="size-[20px] text-background" />
      ) : (
        <Text className="text-xs font-bold text-background">Review ↑</Text>
      )}
    </Pressable>
  )
}
