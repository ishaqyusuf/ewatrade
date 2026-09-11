import type { HelperRowProps } from "@/components/mobile/catalog-setup/catalog-helper-model"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import { cn } from "@/lib/utils"

export function MarketHelperRow({
  helper,
  highlighted,
  personalized,
  selected,
  disabled,
  onPress,
}: HelperRowProps) {
  const badge = selected
    ? "Current"
    : highlighted
      ? personalized
        ? "Best match"
        : "Good default"
      : null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={helper.title}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic
      className={cn(
        "mx-4 mb-3 gap-3 rounded-[20px] border p-4 active:bg-market-soft-band",
        selected
          ? "border-market-palm bg-market-field"
          : "border-market-line bg-market-field",
      )}
    >
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-xl bg-market-marigold">
          <Icon
            name={
              helper.classification === "pattern" ? "LayoutGrid" : "FileText"
            }
            className="size-sm text-market-on-marigold"
          />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-extrabold text-market-ink">
            {helper.title}
          </Text>
          {badge ? (
            <Text className="font-market-mono text-[10px] uppercase tracking-[1px] text-market-accent-ink">
              {badge}
            </Text>
          ) : null}
        </View>
        <Icon
          name={selected ? "Check" : "ChevronRight"}
          className="size-sm text-market-accent-ink"
        />
      </View>
      <Text className="text-sm text-market-muted-ink [-rn-line-height:21]">
        {helper.description}
      </Text>
    </Pressable>
  )
}
