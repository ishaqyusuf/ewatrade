import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { View } from "react-native"
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

/**
 * Folds a screen's big top card while its bottom search is in use, so results
 * get the room. Pass `onFocusChange` to BottomSearchFooter and `folded` here.
 * It folds on focus, stays folded while the field holds text, and opens again
 * once the field is empty and blurred.
 */
export function useSearchFold(query: string, enabled = true) {
  const [focused, setFocused] = useState(false)
  return {
    folded: enabled && (focused || query.trim().length > 0),
    onFocusChange: setFocused,
  }
}

/** Only the card folds; keep tabs, chips and banners outside it. */
export function SearchFold({
  children,
  folded,
}: {
  children: ReactNode
  folded: boolean
}) {
  const reduceMotion = useReducedMotion()
  const [height, setHeight] = useState(0)
  // Clip only while folding or folded, so the open card keeps its shadow.
  const [clip, setClip] = useState(folded)
  const progress = useSharedValue(folded ? 1 : 0)

  useEffect(() => {
    if (folded) setClip(true)
    if (reduceMotion) {
      progress.value = folded ? 1 : 0
      if (!folded) setClip(false)
      return
    }
    progress.value = withTiming(
      folded ? 1 : 0,
      { duration: 300, easing: Easing.bezier(0.2, 0.8, 0.2, 1) },
      (finished) => {
        if (finished && !folded) runOnJS(setClip)(false)
      },
    )
  }, [folded, progress, reduceMotion])

  const style = useAnimatedStyle(() => {
    const p = progress.value
    // Until the card is measured, let it size itself. The inner view is never
    // squeezed, so a card that grows reports its new height through onLayout.
    if (!height) return { opacity: 1 - p }
    return {
      height: height * (1 - p),
      opacity: 1 - p,
      transform: [{ translateY: -10 * p }, { scale: 1 - 0.02 * p }],
    }
  })

  return (
    <Animated.View
      accessibilityElementsHidden={folded}
      importantForAccessibility={folded ? "no-hide-descendants" : "auto"}
      pointerEvents={folded ? "none" : "auto"}
      style={[{ overflow: clip ? "hidden" : "visible" }, style]}
    >
      <View
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height
          if (next > 0 && Math.abs(next - height) > 0.5) setHeight(next)
        }}
      >
        {children}
      </View>
    </Animated.View>
  )
}
