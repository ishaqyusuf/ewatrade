import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { animateDock } from "@/lib/dock-motion"
import { useEffect } from "react"
import { View } from "react-native"
import { useKeyboardState } from "react-native-keyboard-controller"
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useFloatingSurface } from "./floating-search-field"
import { getListCreateFabBottom } from "./list-create-fab-model"

type ScrollToTopButtonProps = {
  /** The tab bar is hidden; the arrow drops to the safe-area line. */
  dockHidden: boolean
  /** Screen states that own the bottom edge: an open search, a selection bar. */
  hidden?: boolean
  onPress: () => void
  testID?: string
  visible: boolean
}

const SIZE = 40
// Centred on the 52 search bubble's line, so the two read as one row.
const LINE_OFFSET = (52 - SIZE) / 2

/**
 * Workshop 01 Messages circle (owner pick, 15 Oct 2026): a small round up
 * arrow, centred above the tab bar. Owner exception to bottom controls hiding
 * on scroll: a deep scroll down is exactly when it is needed, so it stays and
 * rides down with the tab bar's motion instead.
 */
export function ScrollToTopButton({
  dockHidden,
  hidden = false,
  onPress,
  testID = "scroll-to-top-button",
  visible,
}: ScrollToTopButtonProps) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const surface = useFloatingSurface()
  const keyboardVisible = useKeyboardState((state) => state.isVisible)
  const shown = visible && !hidden && !keyboardVisible
  const targetBottom =
    getListCreateFabBottom({
      bottomInset: insets.bottom,
      dockHidden,
      sitsAboveDock: true,
    }) + LINE_OFFSET
  const bottom = useSharedValue(targetBottom)
  const progress = useSharedValue(shown ? 1 : 0)

  useEffect(() => {
    bottom.value = animateDock(
      targetBottom,
      targetBottom < bottom.value,
      reduceMotion,
    )
  }, [bottom, reduceMotion, targetBottom])
  useEffect(() => {
    progress.value = reduceMotion
      ? shown
        ? 1
        : 0
      : withTiming(shown ? 1 : 0, {
          duration: shown ? 200 : 140,
          easing: Easing.out(Easing.cubic),
        })
  }, [progress, reduceMotion, shown])

  const railStyle = useAnimatedStyle(() => ({ bottom: bottom.value }))
  const faceStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 10 },
      { scale: 0.86 + 0.14 * progress.value },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          alignItems: "center",
          left: 0,
          position: "absolute",
          right: 0,
          zIndex: 900,
        },
        railStyle,
      ]}
    >
      <Animated.View
        accessibilityElementsHidden={!shown}
        importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
        pointerEvents={shown ? "auto" : "none"}
        style={faceStyle}
      >
        <View style={{ ...surface, height: SIZE, width: SIZE }}>
          <Pressable
            accessibilityLabel="Scroll to top"
            accessibilityRole="button"
            className="size-full items-center justify-center rounded-full"
            haptic
            // 44 point touch target around the 40 point circle.
            hitSlop={2}
            onPress={onPress}
            testID={testID}
          >
            <Icon className="size-[19px] text-foreground" name="ArrowUp" />
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  )
}
