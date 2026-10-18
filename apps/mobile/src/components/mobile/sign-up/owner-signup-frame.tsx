import { BrandLogo, BrandMark } from "@/components/mobile/brand"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { nativeStackStatusBarStyle } from "@/lib/native-stack-status-bar"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { type ReactNode, createContext, useContext, useId, useRef } from "react"
import { type ScrollView, StyleSheet, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

const SectionScroll = createContext<(target: View) => void>(() => undefined)
export const useOwnerSectionScroll = () => useContext(SectionScroll)
export function useOwnerSignupColors() {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  return {
    ...colors,
    border: colorScheme === "dark" ? "#2E3A34" : colors.border,
  }
}

/** Native layout of the selected mobile owner-signup Workshop. */
export function OwnerSignupFrame({
  title,
  subtitle,
  progress,
  progressTotal,
  onBack,
  footer,
  footerHeight,
  collapsed,
  scrollEnabled,
  testID,
  children,
}: {
  title: string
  subtitle: string
  progress: number
  progressTotal: number
  onBack?: () => void
  footer: ReactNode
  footerHeight: number
  collapsed?: boolean
  scrollEnabled: boolean
  testID: string
  children: ReactNode
}) {
  const colors = useOwnerSignupColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const insets = useSafeAreaInsets()
  const scroll = useRef<ScrollView>(null)
  const offset = useRef(0)
  const gradientId = useId()
  function jump(target: View) {
    target.measureInWindow((_x, y) =>
      scroll.current?.scrollTo({
        y: Math.max(0, offset.current + y - insets.top - 16),
        animated: true,
      }),
    )
  }
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.heroFrom,
        paddingTop: insets.top,
      }}
      testID={testID}
    >
      <Stack.Screen options={nativeStackStatusBarStyle("light")} />
      <StatusBar style="light" />
      <SectionScroll.Provider value={jump}>
        <KeyboardAwareScrollView
          ref={scroll}
          scrollEnabled={scrollEnabled}
          bottomOffset={footerHeight + 12}
          extraKeyboardSpace={0}
          disableScrollOnKeyboardHide
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            offset.current = event.nativeEvent.contentOffset.y
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{
            flexGrow: 1,
            backgroundColor: colors.card,
          }}
        >
          <View
            style={{
              paddingHorizontal: 22,
              paddingTop: 8,
              paddingBottom: collapsed ? 42 : 50,
              backgroundColor: palette.heroFrom,
              overflow: "hidden",
            }}
          >
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg width="100%" height="100%" accessible={false}>
                <Defs>
                  <RadialGradient
                    id={gradientId}
                    cx="100%"
                    cy="0%"
                    rx="130%"
                    ry="140%"
                  >
                    <Stop
                      offset="0"
                      stopColor={colorScheme === "dark" ? "#257055" : "#257F60"}
                    />
                    <Stop offset="0.4" stopColor={palette.heroFrom} />
                    <Stop offset="1" stopColor={palette.heroTo} />
                  </RadialGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
              </Svg>
              <View
                style={{
                  position: "absolute",
                  right: -30,
                  bottom: -40,
                  opacity: 0.07,
                }}
              >
                <BrandMark color="#FFFFFF" size={200} />
              </View>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              {onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous step"
                  onPress={onBack}
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: palette.heroChip,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      name="ArrowLeft"
                      size={18}
                      color={palette.heroForeground}
                    />
                  </View>
                </Pressable>
              ) : null}
              <BrandLogo reverse width={108} />
            </View>
            {!collapsed ? (
              <View style={{ marginTop: 18 }}>
                <Text
                  accessibilityRole="header"
                  style={{
                    fontSize: 23,
                    lineHeight: 28,
                    fontWeight: "800",
                    letterSpacing: -0.75,
                    color: palette.heroForeground,
                    marginVertical: 4,
                  }}
                >
                  {title}
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    lineHeight: 22,
                    color: palette.heroMuted,
                  }}
                >
                  {subtitle}
                </Text>
              </View>
            ) : null}
          </View>
          <View
            style={{
              flex: 1,
              minHeight: 560,
              marginTop: -26,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              backgroundColor: colors.card,
              paddingTop: 22,
              paddingHorizontal: 18,
              paddingBottom: Math.max(24, insets.bottom),
            }}
          >
            <View
              accessible
              accessibilityLabel={`Step ${progress} of ${progressTotal}`}
              style={{ flexDirection: "row", gap: 5, marginBottom: 16 }}
            >
              {Array.from(
                { length: progressTotal },
                (_, index) => index + 1,
              ).map((number) => (
                <View
                  key={number}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 5,
                    backgroundColor:
                      number < progress
                        ? colors.primary
                        : number === progress
                          ? palette.gold
                          : colors.border,
                  }}
                />
              ))}
            </View>
            {children}
          </View>
        </KeyboardAwareScrollView>
      </SectionScroll.Provider>
      {footer}
    </View>
  )
}
