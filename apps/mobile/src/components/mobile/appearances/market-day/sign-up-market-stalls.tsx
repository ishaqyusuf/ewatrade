import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { cn } from "@/lib/utils"
import type { BusinessProfile } from "@ewatrade/utils"

type SignUpMarketHeaderProps = {
  onBack: () => void
  step: number
  subtitle: string
  title: string
  totalSteps?: number
}

export function SignUpMarketHeader({
  onBack,
  step,
  subtitle,
  title,
  totalSteps = 4,
}: SignUpMarketHeaderProps) {
  const largeText = useLargeTextLayout()
  return (
    <View
      className={cn(
        "relative -mx-6 -mt-6 overflow-hidden bg-market-palm px-6 pt-3",
        largeText ? "min-h-[390px]" : "min-h-[276px]",
      )}
      testID="sign-up-market-header"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        className="absolute -right-[30px] top-9 size-[106px] rounded-full bg-market-paprika"
      />
      <View className="z-[2] flex-row items-center justify-between">
        <Pressable
          accessibilityLabel={step === 1 ? "Back to login" : "Previous step"}
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full active:opacity-75"
          haptic
          onPress={onBack}
        >
          <Icon
            className="size-[25px] text-market-on-palm"
            name="ChevronLeft"
          />
        </Pressable>
        <Text
          maxFontSizeMultiplier={largeText ? 1.2 : 1.8}
          numberOfLines={1}
          className={cn(
            "text-right text-xs font-extrabold uppercase tracking-[1.2px] text-market-canopy-accent",
            largeText && "w-[132px]",
          )}
        >
          Step {step} of {totalSteps}
        </Text>
      </View>
      <View className="z-[2] gap-2 px-px pt-2.5">
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={largeText ? 1.35 : DISPLAY_TEXT_FONT_SCALE_CAP}
          className={cn(
            "font-black tracking-[-1.5px] text-market-on-palm",
            largeText
              ? "max-w-[316px] text-[33px] [-rn-line-height:36]"
              : "max-w-[304px] text-[38px] [-rn-line-height:40]",
          )}
        >
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={largeText ? 1.5 : 2}
          className={cn(
            "max-w-[286px] text-sm [-rn-line-height:20] text-market-on-palm-muted",
            largeText && "min-h-[72px]",
          )}
        >
          {subtitle}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        className={cn(
          "absolute -left-6 -right-6 h-[72px] rotate-[-4deg] bg-market-canvas",
          largeText ? "-bottom-7" : "-bottom-8",
        )}
      />
    </View>
  )
}

const STALL_ACCENTS = [
  "border-t-market-paprika",
  "border-t-market-sky",
  "border-t-market-marigold",
  "border-t-market-palm",
] as const

export function SignUpMarketStall({
  index,
  onPress,
  profile,
  selected,
}: {
  index: number
  onPress: () => void
  profile: BusinessProfile
  selected: boolean
}) {
  const largeText = useLargeTextLayout()
  return (
    <Pressable
      accessibilityLabel={`${profile.title}. ${profile.description}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={cn(
        "px-3 pb-3 pt-[11px] active:opacity-[0.82]",
        largeText ? "min-h-[124px] w-full" : "min-h-[118px] w-[48.4%]",
        selected
          ? "border-2 border-market-palm bg-market-soft-band"
          : "border border-market-line bg-market-field",
        "border-t-[7px]",
        STALL_ACCENTS[index % STALL_ACCENTS.length],
      )}
      haptic
      onPress={onPress}
      testID={`business-profile-${profile.key}`}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={cn(
          "mb-[9px] items-center justify-center rounded-full bg-market-palm",
          largeText ? "size-[34px]" : "size-[27px]",
        )}
      >
        <Text
          allowFontScaling={!largeText}
          maxFontSizeMultiplier={1.3}
          className="text-[10px] font-black text-market-on-palm"
        >
          {String(index + 1).padStart(2, "0")}
        </Text>
      </View>
      <Text
        maxFontSizeMultiplier={1.8}
        className="text-[15px] font-black [-rn-line-height:18] text-market-ink"
      >
        {profile.title}
      </Text>
      <Text
        maxFontSizeMultiplier={2}
        numberOfLines={largeText ? undefined : 3}
        className="mt-1 text-[11px] [-rn-line-height:15] text-market-muted-ink"
      >
        {profile.description}
      </Text>
    </Pressable>
  )
}
