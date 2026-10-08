import { CONTENT_MOTION, itemRevealDelay } from "@/lib/content-motion"
import { type ReactNode, useEffect, useRef, useState } from "react"
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
} from "react-native-reanimated"

const easeOut = Easing.out(Easing.cubic)

export const contentEnter = FadeIn.duration(CONTENT_MOTION.enterMs)
  .easing(easeOut)
  .reduceMotion(ReduceMotion.System)

export function itemEnter(index: number) {
  return FadeInDown.duration(CONTENT_MOTION.itemEnterMs)
    .delay(itemRevealDelay(index))
    .easing(easeOut)
    .withInitialValues({
      transform: [{ translateY: CONTENT_MOTION.itemOffsetY }],
    })
    .reduceMotion(ReduceMotion.System)
}

/**
 * Fades its children in when it mounts. Use it around content that replaces a
 * loading state so the swap does not pop.
 */
export function MotionView({
  animate = true,
  children,
  fill = false,
}: {
  /** Pass false when the content was already available as the screen opened. */
  animate?: boolean
  children: ReactNode
  fill?: boolean
}) {
  return (
    <Animated.View
      entering={animate ? contentEnter : undefined}
      style={fill ? { flex: 1 } : undefined}
    >
      {children}
    </Animated.View>
  )
}

/**
 * True for a short window after `ready` first becomes true. Pass it to
 * RevealItem so a list's first page settles in, while rows mounted later by
 * scrolling or pagination appear without motion.
 */
export function useFirstReveal(ready: boolean) {
  // Cached data is ready on the first render, so its rows reveal on mount too.
  const [revealing, setRevealing] = useState(ready)
  const started = useRef(ready)

  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    setRevealing(true)
  }, [ready])

  useEffect(() => {
    if (!revealing) return
    const timer = setTimeout(
      () => setRevealing(false),
      CONTENT_MOTION.revealWindowMs,
    )
    return () => clearTimeout(timer)
  }, [revealing])

  return revealing
}

export function RevealItem({
  active,
  children,
  index,
}: {
  active: boolean
  children: ReactNode
  index: number
}) {
  return (
    <Animated.View entering={active ? itemEnter(index) : undefined}>
      {children}
    </Animated.View>
  )
}
