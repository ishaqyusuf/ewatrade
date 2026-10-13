import {
  BottomSearchFooter,
  FLOATING_SEARCH_GAP,
} from "@/components/mobile/bottom-search-footer"
import { FloatingSearchButton } from "@/components/mobile/floating-search-field"
import { animateDock } from "@/lib/dock-motion"
import { useEffect, useRef, useState } from "react"
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { getListCreateFabBottom } from "./list-create-fab-model"

type TabSearchBubbleProps = {
  accessibilityLabel: string
  /** The tab bar is hidden; the bubble drops to the safe-area position. */
  dockHidden: boolean
  maxLength?: number
  onChangeText: (value: string) => void
  /** Reports search focus, e.g. to fold the screen's top card (useSearchFold). */
  onFocusChange?: (focused: boolean) => void
  placeholder: string
  /** Room kept on the right for a FAB beside the bubble (Orders' Add order). */
  rightInset?: number
  testID?: string
  value: string
}

/**
 * Search on tab screens with the floating tab bar (Orders, the Products tab):
 * a round search button above the tab bar that opens into the floating search
 * pill. The pill folds back into the button once the field is empty and loses
 * focus.
 */
export function TabSearchBubble({
  accessibilityLabel,
  dockHidden,
  maxLength = 160,
  onChangeText,
  onFocusChange,
  placeholder,
  rightInset = 0,
  testID,
  value,
}: TabSearchBubbleProps) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const wasFocused = useRef(false)
  const expanded = open || value.length > 0
  const aboveDock = getListCreateFabBottom({
    bottomInset: insets.bottom,
    sitsAboveDock: true,
  })
  const targetBottom = getListCreateFabBottom({
    bottomInset: insets.bottom,
    dockHidden,
    sitsAboveDock: true,
  })
  const targetRight = 20 + rightInset
  const bottom = useSharedValue(targetBottom)
  const right = useSharedValue(targetRight)

  // Owner exception (13 Oct 2026): scrolling hides only the tab bar, never the
  // search button; it moves down with the tab bar's motion instead.
  useEffect(() => {
    bottom.value = animateDock(
      targetBottom,
      targetBottom < bottom.value,
      reduceMotion,
    )
  }, [bottom, reduceMotion, targetBottom])
  useEffect(() => {
    right.value = animateDock(targetRight, false, reduceMotion)
  }, [reduceMotion, right, targetRight])

  const buttonStyle = useAnimatedStyle(() => ({
    bottom: bottom.value,
    right: right.value,
  }))

  if (expanded)
    return (
      <BottomSearchFooter
        accessibilityLabel={accessibilityLabel}
        alwaysShowSearch
        autoFocus={open && !value}
        // The pill sits on the same line the button did, above the tab bar.
        bottomOffset={Math.max(
          0,
          aboveDock - Math.max(insets.bottom, 8) - FLOATING_SEARCH_GAP,
        )}
        localSearch
        maxLength={maxLength}
        onChangeText={onChangeText}
        onFocusChange={(focused) => {
          onFocusChange?.(focused)
          if (focused) {
            wasFocused.current = true
            return
          }
          if (!wasFocused.current) return
          wasFocused.current = false
          if (!value.trim()) setOpen(false)
        }}
        placeholder={placeholder}
        totalCount={0}
        value={value}
      />
    )

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: "absolute", zIndex: 900 }, buttonStyle]}
    >
      <FloatingSearchButton
        accessibilityLabel={accessibilityLabel}
        onPress={() => setOpen(true)}
        testID={testID}
      />
    </Animated.View>
  )
}
