import { MobileScreen } from "@/components/mobile/screen"
import type {
  SignUpCategoriesProps,
  SignUpPresentationProps,
} from "@/components/mobile/sign-up/sign-up-presentation"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { StatusBar } from "expo-status-bar"
import { useState } from "react"
import { Platform } from "react-native"
import { SignUpMarketHeader, SignUpMarketStall } from "./sign-up-market-stalls"

export function MarketDaySignUpScreen({
  children,
  footer,
  header,
  onBack,
  step,
}: SignUpPresentationProps) {
  const largeText = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const palette = useMarketDayPalette()
  const [canopyScrolledAway, setCanopyScrolledAway] = useState(false)
  const statusColor = canopyScrolledAway ? palette.canvas : palette.palm

  return (
    <View className="flex-1 bg-market-canvas">
      <MobileScreen
        backgroundColor={palette.canvas}
        contentClassName={
          largeText ? "justify-start gap-5" : "justify-start gap-6"
        }
        contentContainerStyle={{
          paddingBottom: step === "businessType" ? (largeText ? 168 : 136) : 40,
        }}
        // Android adjustResize owns keyboard clearance; do not add a second scroll.
        keyboardAutoScrollEnabled={Platform.OS !== "android"}
        keyboardBottomOffset={48}
        onScroll={(event) => {
          const passed =
            event.nativeEvent.contentOffset.y >= (largeText ? 286 : 232)
          setCanopyScrolledAway((current) =>
            current === passed ? current : passed,
          )
        }}
        safeAreaColor={statusColor}
      >
        <StatusBar
          backgroundColor={statusColor}
          style={
            canopyScrolledAway && colorScheme === "light" ? "dark" : "light"
          }
        />
        <SignUpMarketHeader
          onBack={onBack}
          step={header.step}
          subtitle={header.subtitle}
          title={header.title}
        />
        {children}
      </MobileScreen>
      {footer}
    </View>
  )
}

export function MarketDaySignUpCategories({
  onSelect,
  profiles,
  selectedKey,
}: SignUpCategoriesProps) {
  const largeText = useLargeTextLayout()
  return (
    <View
      className={
        largeText ? "gap-3" : "flex-row flex-wrap justify-between gap-y-3"
      }
    >
      {profiles.map((profile, index) => (
        <SignUpMarketStall
          index={index}
          key={profile.key}
          onPress={() => onSelect(profile)}
          profile={profile}
          selected={selectedKey === profile.key}
        />
      ))}
    </View>
  )
}
