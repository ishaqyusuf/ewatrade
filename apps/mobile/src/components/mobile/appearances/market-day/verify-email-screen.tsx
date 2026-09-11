import { MobileScreen } from "@/components/mobile/screen"
import type { VerifyEmailPresentationProps } from "@/components/mobile/verify-email/verify-email-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { StatusBar } from "expo-status-bar"

export function MarketDayVerifyEmailScreen({
  authEntryHref,
  email,
  otp,
  resend,
  keypad,
}: VerifyEmailPresentationProps) {
  const largeText = useLargeTextLayout()
  const palette = useMarketDayPalette()
  return (
    <MobileScreen
      backgroundColor={palette.canvas}
      contentClassName="p-0"
      keyboardBottomOffset={40}
      safeAreaColor={palette.palm}
    >
      <StatusBar backgroundColor={palette.palm} style="light" />
      <View className="min-h-full bg-market-canvas">
        <View
          className={
            largeText
              ? "min-h-[390px] bg-market-palm"
              : "min-h-[310px] bg-market-palm"
          }
        >
          <View className="gap-6 px-5 pt-4">
            <View className="flex-row items-center justify-between">
              <Pressable
                accessibilityLabel="Use another email"
                accessibilityRole="button"
                className="size-12 items-center justify-center rounded-full active:opacity-75"
                haptic
                href={authEntryHref}
              >
                <Icon
                  className="size-base text-market-on-palm"
                  name="ChevronLeft"
                />
              </Pressable>
              <Text
                numberOfLines={largeText ? 2 : 1}
                className={
                  largeText
                    ? "max-w-[245px] text-right text-[10px] font-extrabold uppercase [-rn-line-height:20] tracking-[1.5px] text-market-canopy-accent"
                    : "max-w-[220px] text-right text-[10px] font-extrabold uppercase tracking-[1.5px] text-market-canopy-accent"
                }
              >
                Email check • 6 digits
              </Text>
            </View>
            <View className={largeText ? "gap-4" : "gap-2"}>
              <Text
                accessibilityRole="header"
                className={
                  largeText
                    ? "max-w-[330px] font-market-display text-[34px] font-black [-rn-line-height:39] tracking-[-1.3px] text-market-on-palm"
                    : "max-w-[310px] font-market-display text-[43px] font-black [-rn-line-height:43] tracking-[-1.3px] text-market-on-palm"
                }
              >
                Check your inbox.
              </Text>
              <Text className="text-xs font-medium [-rn-line-height:20] text-market-on-palm-muted">
                Enter the market tally we sent to
              </Text>
              <Text
                numberOfLines={1}
                selectable
                className="max-w-full self-start rounded-full border border-market-pulse-line px-3 py-2 text-[11px] font-bold text-market-on-palm"
              >
                {email}
              </Text>
            </View>
          </View>
          <View
            pointerEvents="none"
            className={
              largeText
                ? "absolute -bottom-[26px] -left-5 -right-5 h-12 -rotate-[4deg] bg-market-canvas"
                : "absolute -bottom-[22px] -left-5 -right-5 h-12 -rotate-[4deg] bg-market-canvas"
            }
          />
        </View>
        <View
          accessibilityLabel="Verify and continue"
          className={
            largeText
              ? "z-10 -mt-[58px] gap-3 px-[18px]"
              : "z-10 -mt-12 gap-3 px-[18px]"
          }
        >
          <View>
            <View
              pointerEvents="none"
              className="absolute -bottom-[7px] left-[7px] -right-[7px] top-[7px] bg-market-marigold"
            />
            {otp}
          </View>
          {resend}
        </View>
        <View
          className={
            largeText
              ? "gap-3 px-[18px] pb-8 pt-8"
              : "gap-3 px-[18px] pb-8 pt-6"
          }
        >
          <View
            className={
              largeText
                ? "items-start gap-1"
                : "flex-row items-center justify-between"
            }
          >
            <Text className="text-[9px] font-extrabold uppercase tracking-[1.4px] text-market-muted-ink">
              Market counter
            </Text>
            <Text className="text-[9px] font-extrabold uppercase tracking-[1.4px] text-market-muted-ink">
              Auto-checks at six
            </Text>
          </View>
          {keypad}
        </View>
      </View>
    </MobileScreen>
  )
}
