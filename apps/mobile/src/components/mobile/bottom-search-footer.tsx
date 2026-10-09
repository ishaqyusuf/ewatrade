import { FormField } from "@/components/mobile/form-field"
import { useColors } from "@/hooks/use-color"
import { shouldShowListSearch } from "@/lib/list-pagination"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

/** Shared with ListCreateFab so a FAB above the footer moves with it. */
export const FOOTER_SLIDE_MS = 240

type BottomSearchFooterProps = {
  accessibilityLabel: string
  alwaysShowSearch?: boolean
  autoFocus?: boolean
  bottomOffset?: number
  children?: ReactNode
  /** Slides the footer down out of view (see useBottomSearchScroll). It stays
   * visible while the search is focused or has text. */
  hidden?: boolean
  includeSafeArea?: boolean
  label?: string
  layout?: "inline" | "stacked"
  maxLength?: number
  localSearch?: boolean
  onChangeText: (value: string) => void
  onHeightChange?: (height: number) => void
  placeholder: string
  showDisabledOfflineSearch?: boolean
  searchVisible?: boolean
  totalCount: number
  value: string
  /** action-bar: Green Till card bar with a rounded top for step actions. */
  variant?: "default" | "market-day" | "action-bar"
}

export function BottomSearchFooter({
  accessibilityLabel,
  alwaysShowSearch = false,
  autoFocus = false,
  bottomOffset = 0,
  children,
  hidden = false,
  includeSafeArea = true,
  label = "Search",
  layout = "stacked",
  maxLength,
  localSearch = false,
  onChangeText,
  onHeightChange,
  placeholder,
  searchVisible = true,
  showDisabledOfflineSearch = false,
  totalCount,
  value,
  variant = "default",
}: BottomSearchFooterProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const marketDay = useMarketDayPalette()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const paddingBottom = includeSafeArea ? Math.max(insets.bottom, 8) : 8
  const reduceMotion = useReducedMotion()
  const [focused, setFocused] = useState(false)
  const [height, setHeight] = useState(0)
  const shouldHide = hidden && !focused && !value
  const hiddenProgress = useSharedValue(shouldHide ? 1 : 0)

  useEffect(() => {
    hiddenProgress.value = withTiming(shouldHide ? 1 : 0, {
      duration: reduceMotion ? 0 : FOOTER_SLIDE_MS,
      easing: Easing.out(Easing.cubic),
    })
  }, [hiddenProgress, reduceMotion, shouldHide])

  const slideStyle = useAnimatedStyle(() => ({
    opacity: 1 - hiddenProgress.value * hiddenProgress.value,
    transform: [{ translateY: hiddenProgress.value * (height + 12) }],
  }))

  const effectiveSearchVisible =
    (!isOffline || localSearch || showDisabledOfflineSearch) &&
    searchVisible &&
    (alwaysShowSearch || shouldShowListSearch(totalCount))

  useEffect(() => {
    if (!localSearch && !showDisabledOfflineSearch && isOffline && value)
      onChangeText("")
  }, [isOffline, localSearch, onChangeText, value, showDisabledOfflineSearch])

  if (!children && !effectiveSearchVisible) return null

  return (
    <KeyboardStickyView
      offset={{ closed: -bottomOffset, opened: 0 }}
      pointerEvents="box-none"
      style={{
        bottom: 0,
        left: 0,
        position: "absolute",
        right: 0,
        zIndex: 20,
      }}
      testID="bottom-search-footer"
    >
      <Animated.View
        pointerEvents={shouldHide ? "none" : "auto"}
        onLayout={(event) => {
          setHeight(event.nativeEvent.layout.height)
          onHeightChange?.(event.nativeEvent.layout.height)
        }}
        style={[
          variant === "action-bar"
            ? {
                backgroundColor: colors.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                boxShadow: "0 -10px 30px rgba(24, 36, 32, 0.10)",
              }
            : {
                backgroundColor:
                  variant === "market-day"
                    ? marketDay.canvas
                    : colors.background,
              },
          slideStyle,
        ]}
      >
        <View style={{ paddingBottom }}>
          <View
            className={
              variant === "action-bar"
                ? "gap-3 px-4 pb-2 pt-3"
                : "gap-3 px-4 pb-2 pt-2"
            }
          >
            <View
              className={
                layout === "inline" ? "flex-row items-center gap-3" : "gap-3"
              }
            >
              {effectiveSearchVisible ? (
                <FormField
                  accessibilityLabel={accessibilityLabel}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={autoFocus}
                  editable={!isOffline || localSearch}
                  containerClassName={
                    layout === "inline" ? "min-w-0 flex-1" : undefined
                  }
                  label={label}
                  leadingIcon="Search"
                  maxLength={maxLength}
                  onBlur={() => setFocused(false)}
                  onChangeText={onChangeText}
                  onFocus={() => setFocused(true)}
                  placeholder={placeholder}
                  returnKeyType="search"
                  value={value}
                  variant={
                    variant === "market-day" ? "market-search" : "search"
                  }
                />
              ) : null}
              {children}
            </View>
          </View>
        </View>
      </Animated.View>
    </KeyboardStickyView>
  )
}
