import {
  initialScrollToTopState,
  nextScrollToTopState,
  startScrollToTop,
} from "@/lib/scroll-to-top"
import { useCallback, useRef, useState } from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"
import { useReducedMotion } from "react-native-reanimated"

export type ScrollToTopTarget =
  | { scrollToOffset: (params: { animated?: boolean; offset: number }) => void }
  | { scrollTo: (params: { animated?: boolean; y: number }) => void }

/**
 * Drives ScrollToTopButton for one list or scroll view. Attach `ref` (a
 * callback ref, so the list keeps inferring its own item type), call
 * `onScroll` from the list's own scroll handler and pass
 * `onContentSizeChange`; state lives in refs and the screen re-renders only
 * when the arrow shows or hides.
 */
export function useScrollToTop() {
  const target = useRef<ScrollToTopTarget | null>(null)
  const ref = useCallback((node: ScrollToTopTarget | null) => {
    target.current = node
  }, [])
  const state = useRef(initialScrollToTopState())
  const viewportHeight = useRef(0)
  const [visible, setVisible] = useState(false)
  const reduceMotion = useReducedMotion()

  const update = useCallback(
    (y: number, contentHeight: number, viewport = viewportHeight.current) => {
      viewportHeight.current = viewport
      state.current = nextScrollToTopState(state.current, {
        contentHeight,
        viewportHeight: viewport,
        y,
      })
      const next = state.current.visible
      setVisible((current) => (current === next ? current : next))
    },
    [],
  )

  const onScroll = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) =>
      update(
        nativeEvent.contentOffset.y,
        nativeEvent.contentSize.height,
        nativeEvent.layoutMeasurement.height,
      ),
    [update],
  )

  // Filters, searches and refreshes can shrink the list without a scroll event.
  const onContentSizeChange = useCallback(
    (_width: number, height: number) => update(state.current.lastY, height),
    [update],
  )

  const scrollToTop = useCallback(() => {
    state.current = startScrollToTop(state.current)
    setVisible(false)
    const list = target.current
    if (!list) return
    const animated = !reduceMotion
    if ("scrollToOffset" in list) list.scrollToOffset({ animated, offset: 0 })
    else list.scrollTo({ animated, y: 0 })
  }, [reduceMotion])

  return { onContentSizeChange, onScroll, ref, scrollToTop, visible }
}
