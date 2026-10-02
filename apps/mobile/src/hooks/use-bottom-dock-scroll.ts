import {
  initialBottomDockScrollState,
  nextBottomDockScrollState,
} from "@/lib/bottom-dock-scroll"
import { useFocusEffect } from "expo-router"
import { useCallback, useRef } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"

export function useBottomDockScroll(onHiddenChange: (hidden: boolean) => void) {
  const state = useRef(initialBottomDockScrollState())
  useFocusEffect(
    useCallback(() => {
      state.current = initialBottomDockScrollState()
      onHiddenChange(false)
    }, [onHiddenChange]),
  )

  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const previous = state.current
      const next = nextBottomDockScrollState(previous, {
        contentHeight: event.nativeEvent.contentSize.height,
        viewportHeight: event.nativeEvent.layoutMeasurement.height,
        y: event.nativeEvent.contentOffset.y,
      })
      state.current = next
      if (previous.hidden !== next.hidden) onHiddenChange(next.hidden)
    },
    [onHiddenChange],
  )
}
