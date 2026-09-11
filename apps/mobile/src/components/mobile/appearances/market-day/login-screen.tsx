import type { LoginPresentationProps } from "@/components/mobile/login/login-presentation"
import { MobileScreen } from "@/components/mobile/screen"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { StatusBar } from "expo-status-bar"

export function MarketDayLoginScreen({
  actions,
  children,
  footer,
}: LoginPresentationProps) {
  const largeText = useLargeTextLayout()
  const palette = useMarketDayPalette()
  return (
    <MobileScreen
      backgroundColor={palette.canvas}
      safeAreaColor={palette.palm}
      contentClassName={
        largeText ? "justify-start gap-5" : "justify-start gap-7"
      }
    >
      <StatusBar style="light" />
      <View className={largeText ? "gap-4" : "gap-5"}>
        <View className="-mx-6 -mt-6 min-h-[226px] overflow-hidden bg-market-palm px-6 pt-6 pb-10">
          <View
            pointerEvents="none"
            className="absolute right-12 top-[124px] h-6 w-[82px] -rotate-[9deg] bg-market-sky opacity-85"
          />
          <View
            pointerEvents="none"
            className="absolute -right-[45px] top-[60px] size-[104px] rounded-full bg-market-paprika opacity-90"
          />
          <View
            className={
              largeText ? "gap-3" : "flex-row items-start justify-between gap-3"
            }
          >
            <View className="flex-row items-center gap-3">
              <View className="size-11 -rotate-3 items-center justify-center rounded-[14px] bg-market-marigold">
                <Icon
                  className="size-[22px] text-market-on-marigold"
                  name="Building2"
                />
              </View>
              <Text
                className="text-[23px] font-black [-rn-line-height:29] tracking-[-0.4px] text-market-on-palm"
                maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
              >
                ẸwáTrade
              </Text>
            </View>
            {actions ? (
              <View className="flex-row gap-2 self-end rounded-3xl bg-market-on-palm p-0.5">
                {actions}
              </View>
            ) : null}
          </View>
          <View className={largeText ? "mt-6 gap-1" : "mt-10 gap-1.5"}>
            <Text className="text-[11px] font-black uppercase [-rn-line-height:16] tracking-[1.4px] text-market-canopy-accent">
              Market day, every day
            </Text>
            <Text
              className="max-w-[250px] text-[23px] font-extrabold [-rn-line-height:29] tracking-[-0.5px] text-market-on-palm"
              maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            >
              Your business, in your pocket
            </Text>
          </View>
          <View
            pointerEvents="none"
            className="absolute -bottom-[41px] -left-[22px] h-[62px] w-[116%] -rotate-[5deg] bg-market-canvas"
          />
        </View>
        <View className="gap-2">
          <Text
            className={
              largeText
                ? "text-[29px] font-black [-rn-line-height:34] tracking-[-1px] text-market-ink"
                : "text-[34px] font-black [-rn-line-height:39] tracking-[-1px] text-market-ink"
            }
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
          >
            Good to see you again.
          </Text>
          <Text className="max-w-[330px] text-sm [-rn-line-height:21] text-market-muted-ink">
            Sign in once, then we will open the work or Store conversations
            available to you.
          </Text>
        </View>
      </View>
      {children}
      <View className={largeText ? "gap-4 px-8" : "gap-3 px-6"}>{footer}</View>
    </MobileScreen>
  )
}
