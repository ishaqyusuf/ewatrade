import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { StatusBar } from "expo-status-bar"
import { Platform, View } from "react-native"
import { MarketDayActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import type { StaffOnboardingPresentationProps } from "@/components/mobile/staff-onboarding/staff-onboarding-presentation"

function getInitials(value: string) {
  const initials = value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return initials || "ST"
}

export function MarketDayStaffOnboardingScreen({
  businessName,
  canSubmit,
  displayName,
  email,
  isSubmitting,
  name,
  onChangeDisplayName,
  onChangeName,
  onSubmit,
  roleLabel,
  submitError,
}: StaffOnboardingPresentationProps) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <MobileScreen
      backgroundColor={marketDay.canvas}
      contentClassName="p-0"
      keyboardAutoScrollEnabled={largeTextLayout || Platform.OS !== "android"}
      keyboardBottomOffset={Platform.OS === "android" ? 12 : 48}
      safeAreaColor={marketDay.palm}
      testID="staff-onboarding-market-nameplate"
    >
      <StatusBar backgroundColor={marketDay.palm} style="light" />
      <View
        className={
          largeTextLayout
            ? "min-h-[286px] overflow-hidden bg-market-palm px-6 pt-4"
            : "min-h-[245px] overflow-hidden bg-market-palm px-6 pt-4"
        }
      >
        <View
          pointerEvents="none"
          className="absolute right-11 top-[132px] h-6 w-[86px] -rotate-[9deg] bg-market-sky opacity-85"
        />
        <View
          pointerEvents="none"
          className="absolute -right-[43px] top-[74px] size-28 rounded-full bg-market-paprika opacity-[0.92]"
        />
        <View className="flex-row items-center gap-3">
          <View className="size-[42px] -rotate-3 items-center justify-center rounded-[13px] bg-market-marigold">
            <Icon
              className="size-5 text-market-on-marigold"
              name="ShieldCheck"
              strokeWidth={2.2}
            />
          </View>
          <Text className="flex-1 text-[11px] font-black uppercase [-rn-line-height:16] tracking-[1.35px] text-market-canopy-accent">
            Your work access
          </Text>
          <Icon
            className="size-[17px] text-market-canopy-accent"
            name="WandSparkles"
          />
        </View>
        <View className="mt-[25px] max-w-[315px] gap-[9px]">
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            className="max-w-[315px] font-market-display text-[38px] font-black [-rn-line-height:40] tracking-[-1.4px] text-market-on-palm"
          >
            Welcome to the counter.
          </Text>
          <Text className="max-w-[280px] text-sm [-rn-line-height:21] text-market-on-palm-muted">
            Set the name your team sees when you record a sale.
          </Text>
        </View>
        <View
          pointerEvents="none"
          className="absolute -bottom-[34px] -left-6 h-[66px] w-[116%] -rotate-[5deg] bg-market-canvas"
        />
      </View>
      <View
        className={
          largeTextLayout
            ? "gap-[26px] px-[22px] pb-5"
            : "gap-[22px] px-[22px] pb-5"
        }
      >
        <View className="-mt-[37px] mr-1.5 bg-market-marigold pb-1.5 pr-1.5">
          <View
            className={
              largeTextLayout
                ? "flex-col items-stretch gap-[11px] border-2 border-market-ink bg-market-field p-[13px]"
                : "flex-row items-center gap-[11px] border-2 border-market-ink bg-market-field p-[13px]"
            }
          >
            <View className="min-w-0 flex-1 flex-row items-center gap-[11px]">
              <View className="size-11 items-center justify-center rounded-full border-2 border-market-ink bg-market-paprika">
                <Text className="text-[13px] font-black [-rn-line-height:17] text-market-on-paprika">
                  {getInitials(name || businessName)}
                </Text>
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-[15px] font-black [-rn-line-height:20] tracking-[-0.2px] text-market-ink">
                  {businessName}
                </Text>
                <Text
                  numberOfLines={largeTextLayout ? undefined : 1}
                  className="text-xs [-rn-line-height:18] text-market-muted-ink"
                >
                  {email}
                </Text>
              </View>
            </View>
            <View
              className={
                largeTextLayout
                  ? "min-h-[30px] items-center justify-center self-start rounded-full bg-market-soft-band px-2.5 py-[5px]"
                  : "min-h-[30px] items-center justify-center rounded-full bg-market-soft-band px-2.5 py-[5px]"
              }
            >
              <Text className="text-[10px] font-black uppercase [-rn-line-height:14] tracking-[0.7px] text-market-ink">
                {roleLabel}
              </Text>
            </View>
          </View>
        </View>
        <View className="gap-[17px]">
          <FormField
            autoCapitalize="words"
            label="Full name"
            leadingIcon="User"
            onChangeText={onChangeName}
            placeholder="Enter your full name"
            testID="staff-onboarding-full-name"
            value={name}
          />
          <FormField
            autoCapitalize="words"
            helper="Optional. This shorter name can appear on sales records."
            label="Display name · optional"
            leadingIcon="User"
            onChangeText={onChangeDisplayName}
            placeholder="Enter your display name"
            testID="staff-onboarding-display-name"
            value={displayName}
          />
          {submitError ? (
            <StatusBanner
              icon="TriangleAlert"
              message={submitError}
              title="Staff setup failed"
              tone="destructive"
            />
          ) : null}
        </View>
        <View className="gap-[11px]">
          <MarketDayActionButton
            disabled={!canSubmit || isSubmitting}
            isLoading={isSubmitting}
            loadingLabel="Activating"
            onPress={onSubmit}
            testID="staff-onboarding-submit"
            tone="marigold"
            trailingIcon="ArrowRight"
          >
            Start selling
          </MarketDayActionButton>
          <Text className="text-center text-xs [-rn-line-height:18] text-market-muted-ink">
            Your work access stays tied to this email account.
          </Text>
        </View>
      </View>
    </MobileScreen>
  )
}
