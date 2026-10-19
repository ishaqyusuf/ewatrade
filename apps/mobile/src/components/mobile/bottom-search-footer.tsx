import { FloatingSearchField } from "@/components/mobile/floating-search-field"
import { useColors } from "@/hooks/use-color"
import {
  DOCK_OPACITY_INPUT,
  DOCK_OPACITY_OUTPUT,
  animateDock,
} from "@/lib/dock-motion"
import { shouldShowListSearch } from "@/lib/list-pagination"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export type BottomSearchFooterProps = {
  accessibilityLabel: string
  alwaysShowSearch?: boolean
  autoFocus?: boolean
  bottomOffset?: number
  /** Floating search only: a small note above the search row (a sale total).
   * It hides while the search is focused. */
  caption?: ReactNode
  children?: ReactNode
  /** Optional step action card above the unchanged search pill. */
  actionsAboveSearch?: boolean
  /** Slides the footer down out of view (see useBottomSearchScroll). It stays
   * visible while the search is focused or has text. */
  hidden?: boolean
  includeSafeArea?: boolean
  editable?: boolean
  /** A Gorhom sheet already owns keyboard movement. Keep the same dock UI. */
  keyboardOwner?: "screen" | "sheet"
  position?: "absolute" | "relative"
  label?: string
  layout?: "inline" | "stacked"
  maxLength?: number
  localSearch?: boolean
  onChangeText: (value: string) => void
  /** Reports search focus, e.g. to fold the screen's top card (useSearchFold). */
  onFocusChange?: (focused: boolean) => void
  onHeightChange?: (height: number) => void
  placeholder: string
  showDisabledOfflineSearch?: boolean
  searchVisible?: boolean
  totalCount: number
  value: string
  /** action-bar: Green Till card bar with a rounded top for step actions.
   * Applies only when the footer shows no search; a visible search always
   * floats as a pill with no bar behind it. */
  variant?: "default" | "action-bar"
}

/** Space between the floating search and the safe-area bottom edge. */
export const FLOATING_SEARCH_GAP = 10

export function BottomSearchFooter({
  accessibilityLabel,
  alwaysShowSearch = false,
  autoFocus = false,
  bottomOffset = 0,
  caption,
  children,
  actionsAboveSearch = false,
  hidden = false,
  includeSafeArea = true,
  editable = true,
  keyboardOwner = "screen",
  position = "absolute",
  label = "Search",
  layout = "stacked",
  maxLength,
  localSearch = false,
  onChangeText,
  onFocusChange,
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
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const paddingBottom = includeSafeArea ? Math.max(insets.bottom, 8) : 8
  const reduceMotion = useReducedMotion()
  const [focused, setFocused] = useState(false)
  const [height, setHeight] = useState(0)

  const effectiveSearchVisible =
    (!isOffline || localSearch || showDisabledOfflineSearch) &&
    searchVisible &&
    (alwaysShowSearch || shouldShowListSearch(totalCount))
  // A field that unmounts while focused never blurs, so only count focus
  // while the search is on screen.
  const searchFocused = focused && effectiveSearchVisible
  const shouldHide = hidden && !searchFocused && !value
  const hiddenProgress = useSharedValue(shouldHide ? 1 : 0)
  const onFocusChangeRef = useRef(onFocusChange)
  onFocusChangeRef.current = onFocusChange

  useEffect(() => {
    hiddenProgress.value = animateDock(
      shouldHide ? 1 : 0,
      shouldHide,
      reduceMotion,
    )
  }, [hiddenProgress, reduceMotion, shouldHide])

  useEffect(() => {
    onFocusChangeRef.current?.(searchFocused)
  }, [searchFocused])
  useEffect(() => () => onFocusChangeRef.current?.(false), [])

  const slideStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      hiddenProgress.value,
      DOCK_OPACITY_INPUT,
      DOCK_OPACITY_OUTPUT,
    ),
    transform: [{ translateY: hiddenProgress.value * (height + 12) }],
  }))

  useEffect(() => {
    if (!localSearch && !showDisabledOfflineSearch && isOffline && value)
      onChangeText("")
  }, [isOffline, localSearch, onChangeText, value, showDisabledOfflineSearch])

  if (!children && !effectiveSearchVisible) return null

  const onLayout = (event: {
    nativeEvent: { layout: { height: number } }
  }) => {
    setHeight(event.nativeEvent.layout.height)
    onHeightChange?.(event.nativeEvent.layout.height)
  }

  const FooterContainer = keyboardOwner === "sheet" ? View : KeyboardStickyView
  return (
    <FooterContainer
      {...(keyboardOwner === "screen"
        ? { offset: { closed: -bottomOffset, opened: 0 } }
        : {})}
      pointerEvents="box-none"
      style={{
        bottom: 0,
        left: 0,
        position,
        right: 0,
        zIndex: 20,
      }}
      testID="bottom-search-footer"
    >
      {effectiveSearchVisible ? (
        // Floating search: the pill and any step action float over the list
        // with no bar behind them, so touches around them reach the list.
        <Animated.View
          onLayout={onLayout}
          pointerEvents={shouldHide ? "none" : "box-none"}
          style={[
            {
              gap: 10,
              paddingBottom: paddingBottom + FLOATING_SEARCH_GAP,
              paddingHorizontal: 24,
            },
            slideStyle,
          ]}
        >
          {caption && !searchFocused ? (
            <View className="items-end" pointerEvents="none">
              {caption}
            </View>
          ) : null}
          <View
            className={
              layout === "inline" ? "flex-row items-center gap-2.5" : "gap-2.5"
            }
            pointerEvents="box-none"
          >
            {actionsAboveSearch ? children : null}
            <View className={layout === "inline" ? "min-w-0 flex-1" : ""}>
              <FloatingSearchField
                accessibilityLabel={accessibilityLabel || label}
                autoFocus={autoFocus}
                editable={editable && (!isOffline || localSearch)}
                focused={searchFocused}
                maxLength={maxLength}
                onBlur={() => setFocused(false)}
                onChangeText={onChangeText}
                onFocus={() => setFocused(true)}
                placeholder={placeholder}
                value={value}
              />
            </View>
            {actionsAboveSearch ? null : children}
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          pointerEvents={shouldHide ? "none" : "auto"}
          onLayout={onLayout}
          style={[
            variant === "action-bar"
              ? {
                  backgroundColor: colors.card,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  boxShadow: "0 -10px 30px rgba(24, 36, 32, 0.10)",
                }
              : { backgroundColor: colors.background },
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
                {children}
              </View>
            </View>
          </View>
        </Animated.View>
      )}
    </FooterContainer>
  )
}
