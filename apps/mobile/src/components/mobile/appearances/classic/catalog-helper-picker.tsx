import type { HelperRowProps } from "@/components/mobile/catalog-setup/catalog-helper-model"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { View } from "react-native"

export function ClassicHelperRow({
  disabled = false,
  helper,
  highlighted,
  onPress,
  personalized,
  selected,
}: HelperRowProps) {
  const largeTextLayout = useLargeTextLayout()
  const badgeLabel = selected
    ? "Current"
    : highlighted
      ? personalized
        ? "Best match"
        : "Good default"
      : null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      className={
        largeTextLayout
          ? "min-h-20 flex-row items-start gap-3 border-b border-border px-5 py-3 active:bg-muted"
          : "min-h-20 flex-row items-center gap-3 border-b border-border px-5 py-3 active:bg-muted"
      }
      haptic
      onPress={onPress}
    >
      <View
        className={
          largeTextLayout
            ? "mt-1 h-10 w-10 items-center justify-center rounded-2xl bg-muted"
            : "h-10 w-10 items-center justify-center rounded-2xl bg-muted"
        }
      >
        <Icon
          className="size-sm text-primary"
          name={helper.classification === "pattern" ? "LayoutGrid" : "FileText"}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{helper.title}</Text>
        <Text className="text-xs [-rn-line-height:16] text-muted-foreground">
          {helper.description}
        </Text>
        {largeTextLayout && badgeLabel ? (
          <View
            className={
              selected
                ? "mt-2 self-start rounded-full bg-primary px-2.5 py-1"
                : "mt-2 self-start rounded-full bg-primary/10 px-2.5 py-1"
            }
          >
            <Text
              className={
                selected
                  ? "text-[11px] font-bold text-primary-foreground"
                  : "text-[11px] font-bold text-primary"
              }
            >
              {badgeLabel}
            </Text>
          </View>
        ) : null}
      </View>
      {!largeTextLayout && selected ? (
        <View className="rounded-full bg-primary px-2.5 py-1">
          <Text className="text-[11px] font-bold text-primary-foreground">
            Current
          </Text>
        </View>
      ) : !largeTextLayout && highlighted ? (
        <View className="rounded-full bg-primary/10 px-2.5 py-1">
          <Text className="text-[11px] font-bold text-primary">
            {personalized ? "Best match" : "Good default"}
          </Text>
        </View>
      ) : (
        <Icon
          className={
            largeTextLayout
              ? "mt-1 size-sm text-muted-foreground"
              : "size-sm text-muted-foreground"
          }
          name="ChevronRight"
        />
      )}
    </Pressable>
  )
}
